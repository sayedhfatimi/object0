//! S3 object operations: list, multipart upload, download, tar.gz archive,
//! server-side + temp-file copy, and batched delete.

use super::*;

pub(crate) async fn s3_list_all_objects(
    client: &S3Client,
    bucket: &str,
    prefix: &str,
) -> Result<Vec<RemoteObject>, String> {
    let mut continuation_token: Option<String> = None;
    let mut all_objects: Vec<RemoteObject> = Vec::new();

    loop {
        let mut request = client
            .list_objects_v2()
            .bucket(bucket.to_string())
            .max_keys(S3_LIST_MAX_KEYS)
            .prefix(prefix.to_string());

        if let Some(token) = continuation_token.as_deref() {
            request = request.continuation_token(token.to_string());
        }

        let output = request.send().await.map_err(|err| err.to_string())?;

        for item in output.contents() {
            all_objects.push(RemoteObject {
                key: item.key().unwrap_or_default().to_string(),
                size: item.size().unwrap_or(0).max(0),
                etag: item
                    .e_tag()
                    .unwrap_or_default()
                    .trim_matches('"')
                    .to_string(),
                last_modified: item
                    .last_modified()
                    .map(s3_datetime_to_iso)
                    .unwrap_or_else(now_iso),
            });
        }

        if output.is_truncated().unwrap_or(false) {
            continuation_token = output.next_continuation_token().map(str::to_string);
        } else {
            break;
        }
    }

    Ok(all_objects)
}

pub(crate) async fn s3_upload_file(
    client: &S3Client,
    bucket: &str,
    key: &str,
    local_path: &Path,
    cancel_flag: &AtomicBool,
    mut on_progress: impl FnMut(i64, i64),
) -> Result<i64, String> {
    if cancel_flag.load(Ordering::SeqCst) {
        return Err(JOB_CANCELLED.to_string());
    }

    let total = fs::metadata(local_path)
        .map(|meta| meta.len() as i64)
        .unwrap_or(0)
        .max(0);

    if total <= MULTIPART_THRESHOLD_BYTES {
        let body = ByteStream::from_path(local_path.to_path_buf())
            .await
            .map_err(|err| format!("Failed to stream {}: {err}", local_path.display()))?;

        client
            .put_object()
            .bucket(bucket.to_string())
            .key(key.to_string())
            .body(body)
            .send()
            .await
            .map_err(|err| err.to_string())?;

        on_progress(total, total);
        return Ok(total);
    }

    let multipart = client
        .create_multipart_upload()
        .bucket(bucket.to_string())
        .key(key.to_string())
        .send()
        .await
        .map_err(|err| err.to_string())?;
    let upload_id = multipart
        .upload_id()
        .map(str::to_string)
        .ok_or_else(|| "Missing multipart upload id".to_string())?;

    let mut file = tokio_fs::File::open(local_path)
        .await
        .map_err(|err| format!("Failed to open {}: {err}", local_path.display()))?;
    let mut transferred: i64 = 0;
    let mut part_number: i32 = 1;
    let mut parts: Vec<CompletedPart> = Vec::new();

    let upload_result: Result<(), String> = async {
        loop {
            if cancel_flag.load(Ordering::SeqCst) {
                return Err(JOB_CANCELLED.to_string());
            }

            let mut buffer = vec![0u8; MULTIPART_PART_SIZE_BYTES];
            let mut read_total: usize = 0;
            while read_total < buffer.len() {
                let read = file
                    .read(&mut buffer[read_total..])
                    .await
                    .map_err(|err| format!("Failed reading {}: {err}", local_path.display()))?;
                if read == 0 {
                    break;
                }
                read_total += read;
            }

            if read_total == 0 {
                break;
            }
            buffer.truncate(read_total);

            let output = client
                .upload_part()
                .bucket(bucket.to_string())
                .key(key.to_string())
                .upload_id(upload_id.clone())
                .part_number(part_number)
                .body(ByteStream::from(buffer))
                .send()
                .await
                .map_err(|err| err.to_string())?;

            let completed_part = CompletedPart::builder()
                .set_e_tag(output.e_tag().map(str::to_string))
                .part_number(part_number)
                .build();
            parts.push(completed_part);

            transferred += read_total as i64;
            on_progress(transferred, total);
            part_number += 1;
        }

        if parts.is_empty() {
            return Err("Multipart upload produced no parts".to_string());
        }

        let completed_upload = CompletedMultipartUpload::builder()
            .set_parts(Some(parts))
            .build();

        client
            .complete_multipart_upload()
            .bucket(bucket.to_string())
            .key(key.to_string())
            .upload_id(upload_id.clone())
            .multipart_upload(completed_upload)
            .send()
            .await
            .map_err(|err| err.to_string())?;

        Ok(())
    }
    .await;

    if let Err(err) = upload_result {
        let _ = client
            .abort_multipart_upload()
            .bucket(bucket.to_string())
            .key(key.to_string())
            .upload_id(upload_id)
            .send()
            .await;
        return Err(err);
    }

    on_progress(total, total);
    Ok(total)
}

pub(crate) async fn s3_download_file(
    client: &S3Client,
    bucket: &str,
    key: &str,
    local_path: &Path,
    cancel_flag: &AtomicBool,
    mut on_progress: impl FnMut(i64, i64),
) -> Result<i64, String> {
    if cancel_flag.load(Ordering::SeqCst) {
        return Err(JOB_CANCELLED.to_string());
    }

    if let Some(parent) = local_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|err| format!("Failed to create {}: {err}", parent.display()))?;
    }

    let output = client
        .get_object()
        .bucket(bucket.to_string())
        .key(key.to_string())
        .send()
        .await
        .map_err(|err| err.to_string())?;
    let total = output.content_length().unwrap_or(0).max(0);

    let file = tokio_fs::File::create(local_path)
        .await
        .map_err(|err| format!("Failed to create {}: {err}", local_path.display()))?;
    let mut writer = BufWriter::new(file);
    let mut body = output.body;
    let mut transferred: i64 = 0;

    while let Some(bytes) = body
        .try_next()
        .await
        .map_err(|err| format!("Download stream failed: {err}"))?
    {
        if cancel_flag.load(Ordering::SeqCst) {
            let _ = tokio_fs::remove_file(local_path).await;
            return Err(JOB_CANCELLED.to_string());
        }

        writer
            .write_all(&bytes)
            .await
            .map_err(|err| format!("Failed writing {}: {err}", local_path.display()))?;

        transferred += bytes.len() as i64;
        on_progress(transferred, total);
    }

    writer
        .flush()
        .await
        .map_err(|err| format!("Failed flushing {}: {err}", local_path.display()))?;

    Ok(transferred.max(total))
}

pub(crate) async fn s3_download_archive_tar_gz(
    client: &S3Client,
    bucket: &str,
    keys: &[String],
    common_prefix: &str,
    destination_path: &Path,
    cancel_flag: &AtomicBool,
    mut on_progress: impl FnMut(i64, i64),
) -> Result<i64, String> {
    if cancel_flag.load(Ordering::SeqCst) {
        return Err(JOB_CANCELLED.to_string());
    }
    if keys.is_empty() {
        return Err("No objects selected for archive".to_string());
    }

    if let Some(parent) = destination_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|err| format!("Failed to create {}: {err}", parent.display()))?;
    }

    let result: Result<i64, String> = async {
        let archive_file = fs::File::create(destination_path).map_err(|err| {
            format!(
                "Failed to create archive {}: {err}",
                destination_path.display()
            )
        })?;
        let writer = io::BufWriter::new(archive_file);
        let mut encoder = GzEncoder::new(writer, Compression::default());

        let mut transferred: i64 = 0;
        let mut total: i64 = 0;
        const TAR_BLOCK_SIZE: usize = 512;
        const TAR_END_BLOCKS: [u8; TAR_BLOCK_SIZE * 2] = [0; TAR_BLOCK_SIZE * 2];
        const TAR_PAD_BLOCK: [u8; TAR_BLOCK_SIZE] = [0; TAR_BLOCK_SIZE];

        on_progress(0, 0);

        for key in keys {
            if cancel_flag.load(Ordering::SeqCst) {
                return Err(JOB_CANCELLED.to_string());
            }

            let relative = if !common_prefix.is_empty() && key.starts_with(common_prefix) {
                key[common_prefix.len()..].to_string()
            } else {
                key.clone()
            };
            if relative.is_empty() {
                continue;
            }

            let safe_relative = sanitize_relative_path(&relative)
                .ok_or_else(|| format!("Invalid object key for archive entry: {key}"))?;

            let output = client
                .get_object()
                .bucket(bucket.to_string())
                .key(key.to_string())
                .send()
                .await
                .map_err(|err| err.to_string())?;

            let expected_size = if let Some(size) = output.content_length() {
                size.max(0)
            } else {
                client
                    .head_object()
                    .bucket(bucket.to_string())
                    .key(key.to_string())
                    .send()
                    .await
                    .map_err(|err| err.to_string())?
                    .content_length()
                    .unwrap_or(0)
                    .max(0)
            };

            let mut header = tar::Header::new_gnu();
            header.set_entry_type(tar::EntryType::Regular);
            header.set_path(&safe_relative).map_err(|err| {
                format!(
                    "Invalid archive entry path {}: {err}",
                    safe_relative.display()
                )
            })?;
            header.set_size(expected_size as u64);
            header.set_mode(0o644);
            header.set_mtime(0);
            header.set_cksum();

            encoder.write_all(header.as_bytes()).map_err(|err| {
                format!(
                    "Failed writing tar header for {}: {err}",
                    safe_relative.display()
                )
            })?;

            let mut body = output.body;
            let mut file_transferred: i64 = 0;

            while let Some(bytes) = body
                .try_next()
                .await
                .map_err(|err| format!("Download stream failed: {err}"))?
            {
                if cancel_flag.load(Ordering::SeqCst) {
                    return Err(JOB_CANCELLED.to_string());
                }

                encoder.write_all(&bytes).map_err(|err| {
                    format!(
                        "Failed writing tar data for {}: {err}",
                        safe_relative.display()
                    )
                })?;
                file_transferred += bytes.len() as i64;

                let aggregate_total = (total + expected_size).max(transferred + file_transferred);
                on_progress(transferred + file_transferred, aggregate_total);
            }

            if file_transferred != expected_size {
                return Err(format!(
                    "Unexpected size for {} (expected {}, downloaded {})",
                    safe_relative.display(),
                    expected_size,
                    file_transferred
                ));
            }

            let padding = (TAR_BLOCK_SIZE as i64 - (file_transferred % TAR_BLOCK_SIZE as i64))
                % TAR_BLOCK_SIZE as i64;
            if padding > 0 {
                encoder
                    .write_all(&TAR_PAD_BLOCK[..padding as usize])
                    .map_err(|err| {
                        format!(
                            "Failed writing tar padding for {}: {err}",
                            safe_relative.display()
                        )
                    })?;
            }

            transferred += file_transferred;
            total += expected_size;
            on_progress(transferred, total);
        }

        encoder
            .write_all(&TAR_END_BLOCKS)
            .map_err(|err| format!("Failed finalizing tar payload: {err}"))?;
        encoder
            .finish()
            .map_err(|err| format!("Failed finalizing gzip stream: {err}"))?;

        if cancel_flag.load(Ordering::SeqCst) {
            return Err(JOB_CANCELLED.to_string());
        }

        Ok(transferred.max(total))
    }
    .await;

    if result.is_err() {
        let _ = fs::remove_file(destination_path);
    }

    result
}

pub(crate) async fn s3_copy_object_via_temp_file(
    source_client: &S3Client,
    source_bucket: &str,
    source_key: &str,
    dest_client: &S3Client,
    dest_bucket: &str,
    dest_key: &str,
    cancel_flag: &AtomicBool,
    mut on_progress: impl FnMut(i64, i64),
) -> Result<i64, String> {
    if cancel_flag.load(Ordering::SeqCst) {
        return Err(JOB_CANCELLED.to_string());
    }

    let head = source_client
        .head_object()
        .bucket(source_bucket.to_string())
        .key(source_key.to_string())
        .send()
        .await
        .map_err(|err| err.to_string())?;
    let size = head.content_length().unwrap_or(0).max(0);

    let temp_path = std::env::temp_dir().join(format!("object0-copy-{}", Uuid::new_v4()));

    let result = async {
        s3_download_file(
            source_client,
            source_bucket,
            source_key,
            &temp_path,
            cancel_flag,
            |transferred, _| on_progress((transferred / 2).min(size), size),
        )
        .await?;

        if cancel_flag.load(Ordering::SeqCst) {
            return Err(JOB_CANCELLED.to_string());
        }

        s3_upload_file(
            dest_client,
            dest_bucket,
            dest_key,
            &temp_path,
            cancel_flag,
            |transferred, _| on_progress((size / 2 + transferred / 2).min(size), size),
        )
        .await?;

        on_progress(size, size);
        Ok(size)
    }
    .await;

    let _ = fs::remove_file(&temp_path);
    result
}

pub(crate) async fn s3_copy_object(
    source_client: &S3Client,
    source_bucket: &str,
    source_key: &str,
    dest_client: &S3Client,
    dest_bucket: &str,
    dest_key: &str,
    cancel_flag: &AtomicBool,
    mut on_progress: impl FnMut(i64, i64),
) -> Result<i64, String> {
    if cancel_flag.load(Ordering::SeqCst) {
        return Err(JOB_CANCELLED.to_string());
    }

    let head = source_client
        .head_object()
        .bucket(source_bucket.to_string())
        .key(source_key.to_string())
        .send()
        .await
        .map_err(|err| err.to_string())?;
    let size = head.content_length().unwrap_or(0).max(0);

    let source_key_encoded = utf8_percent_encode(source_key, COPY_SOURCE_ENCODE_SET);
    let copy_source = format!("{}/{}", source_bucket, source_key_encoded);

    dest_client
        .copy_object()
        .bucket(dest_bucket.to_string())
        .key(dest_key.to_string())
        .copy_source(copy_source)
        .send()
        .await
        .map_err(|err| err.to_string())?;

    on_progress(size, size);
    Ok(size)
}

pub(crate) async fn s3_delete_keys(client: &S3Client, bucket: &str, keys: &[String]) -> Result<(), String> {
    if keys.is_empty() {
        return Ok(());
    }

    if keys.len() == 1 {
        client
            .delete_object()
            .bucket(bucket.to_string())
            .key(keys[0].clone())
            .send()
            .await
            .map_err(|err| err.to_string())?;
        return Ok(());
    }

    let mut objects = Vec::with_capacity(keys.len());
    for key in keys {
        let object = ObjectIdentifier::builder()
            .key(key.clone())
            .build()
            .map_err(|err| format!("Invalid object identifier: {err}"))?;
        objects.push(object);
    }

    let delete = Delete::builder()
        .set_objects(Some(objects))
        .build()
        .map_err(|err| format!("Invalid delete payload: {err}"))?;

    client
        .delete_objects()
        .bucket(bucket.to_string())
        .delete(delete)
        .send()
        .await
        .map_err(|err| err.to_string())?;

    Ok(())
}
