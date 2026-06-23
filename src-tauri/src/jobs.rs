//! Background job queue: dispatch of queued upload/download/copy/move/delete/
//! archive/sync work, plus enqueue and cancel.

use super::*;

pub(crate) fn try_start_queued_jobs(app: AppHandle) {
    let state = app.state::<AppState>();

    let mut start_now: Vec<(JobTask, Arc<AtomicBool>)> = Vec::new();
    let mut running_snapshots: Vec<JobInfo> = Vec::new();

    if let Ok(mut jobs) = lock_state(&state.jobs) {
        while jobs.running.len() < jobs.concurrency as usize {
            let Some(task) = jobs.queue.pop_front() else {
                break;
            };

            let cancel_flag = jobs
                .cancel_flags
                .entry(task.id.clone())
                .or_insert_with(|| Arc::new(AtomicBool::new(false)))
                .clone();
            jobs.running.insert(task.id.clone());

            if let Some(job) = jobs.jobs.get_mut(&task.id) {
                job.status = JobStatus::Running;
                job.started_at = Some(now_iso());
                job.speed = 0;
                job.eta = 0;
                running_snapshots.push(job.clone());
            }

            start_now.push((task, cancel_flag));
        }
    }

    for snapshot in running_snapshots {
        emit_job_progress_event(&app, &snapshot);
    }

    for (task, cancel_flag) in start_now {
        let app_handle = app.clone();
        tauri::async_runtime::spawn(async move {
            let result: Result<i64, String> = async {
                let state = app_handle.state::<AppState>();
                let mut speed_calc = (Instant::now(), 0i64);

                let update = |transferred: i64, total: i64, speed_calc: &mut (Instant, i64)| {
                    let now = Instant::now();
                    let dt = now.duration_since(speed_calc.0).as_secs_f64();
                    let bytes_delta = transferred - speed_calc.1;
                    let speed = if dt > 0.4 {
                        (bytes_delta as f64 / dt) as i64
                    } else {
                        0
                    };
                    let eta = if speed > 0 && total > transferred {
                        (total - transferred) / speed.max(1)
                    } else {
                        0
                    };
                    if dt > 0.4 {
                        *speed_calc = (now, transferred);
                    }
                    update_job_progress(&app_handle, &task.id, transferred, total, speed, eta);
                };

                match &task.kind {
                    JobTaskKind::Upload {
                        profile_id,
                        bucket,
                        key,
                        local_path,
                    } => {
                        let profile = profile_for_id(&state, profile_id)?;
                        let client = to_s3_client(&profile)?;
                        if local_path.trim().is_empty() {
                            update(0, 0, &mut speed_calc);
                            client
                                .put_object()
                                .bucket(bucket.to_string())
                                .key(key.to_string())
                                .body(ByteStream::from(Vec::<u8>::new()))
                                .send()
                                .await
                                .map_err(|err| err.to_string())?;
                            update(0, 0, &mut speed_calc);
                            Ok(0)
                        } else {
                            let local = expand_user_path(local_path);
                            let total = fs::metadata(&local)
                                .map(|m| m.len() as i64)
                                .unwrap_or(0)
                                .max(0);
                            update(0, total, &mut speed_calc);
                            s3_upload_file(&client, bucket, key, &local, &cancel_flag, |t, tot| {
                                update(t, tot, &mut speed_calc);
                            })
                            .await
                        }
                    }
                    JobTaskKind::Download {
                        profile_id,
                        bucket,
                        key,
                        local_path,
                    } => {
                        let profile = profile_for_id(&state, profile_id)?;
                        let client = to_s3_client(&profile)?;
                        let local = expand_user_path(local_path);
                        update(0, 0, &mut speed_calc);
                        s3_download_file(&client, bucket, key, &local, &cancel_flag, |t, tot| {
                            update(t, tot, &mut speed_calc);
                        })
                        .await
                    }
                    JobTaskKind::Copy {
                        source_profile_id,
                        source_bucket,
                        source_key,
                        dest_profile_id,
                        dest_bucket,
                        dest_key,
                    } => {
                        let src_profile = profile_for_id(&state, source_profile_id)?;
                        let dst_profile = profile_for_id(&state, dest_profile_id)?;
                        let src_client = to_s3_client(&src_profile)?;
                        let dst_client = to_s3_client(&dst_profile)?;
                        let same_profile = source_profile_id == dest_profile_id;
                        update(0, 0, &mut speed_calc);
                        if same_profile {
                            match s3_copy_object(
                                &src_client,
                                source_bucket,
                                source_key,
                                &dst_client,
                                dest_bucket,
                                dest_key,
                                &cancel_flag,
                                |t, tot| update(t, tot, &mut speed_calc),
                            )
                            .await
                            {
                                Ok(transferred) => Ok(transferred),
                                Err(err) if err == JOB_CANCELLED => Err(err),
                                Err(err) => s3_copy_object_via_temp_file(
                                    &src_client,
                                    source_bucket,
                                    source_key,
                                    &dst_client,
                                    dest_bucket,
                                    dest_key,
                                    &cancel_flag,
                                    |t, tot| update(t, tot, &mut speed_calc),
                                )
                                .await
                                .map_err(|fallback_err| {
                                    format!("{err}; fallback copy failed: {fallback_err}")
                                }),
                            }
                        } else {
                            s3_copy_object_via_temp_file(
                                &src_client,
                                source_bucket,
                                source_key,
                                &dst_client,
                                dest_bucket,
                                dest_key,
                                &cancel_flag,
                                |t, tot| update(t, tot, &mut speed_calc),
                            )
                            .await
                        }
                    }
                    JobTaskKind::Move {
                        source_profile_id,
                        source_bucket,
                        source_key,
                        dest_profile_id,
                        dest_bucket,
                        dest_key,
                    } => {
                        let src_profile = profile_for_id(&state, source_profile_id)?;
                        let dst_profile = profile_for_id(&state, dest_profile_id)?;
                        let src_client = to_s3_client(&src_profile)?;
                        let dst_client = to_s3_client(&dst_profile)?;
                        let same_profile = source_profile_id == dest_profile_id;
                        update(0, 0, &mut speed_calc);
                        let transferred = if same_profile {
                            match s3_copy_object(
                                &src_client,
                                source_bucket,
                                source_key,
                                &dst_client,
                                dest_bucket,
                                dest_key,
                                &cancel_flag,
                                |t, tot| update(t, tot, &mut speed_calc),
                            )
                            .await
                            {
                                Ok(transferred) => transferred,
                                Err(err) if err == JOB_CANCELLED => return Err(err),
                                Err(err) => s3_copy_object_via_temp_file(
                                    &src_client,
                                    source_bucket,
                                    source_key,
                                    &dst_client,
                                    dest_bucket,
                                    dest_key,
                                    &cancel_flag,
                                    |t, tot| update(t, tot, &mut speed_calc),
                                )
                                .await
                                .map_err(|fallback_err| {
                                    format!("{err}; fallback copy failed: {fallback_err}")
                                })?,
                            }
                        } else {
                            s3_copy_object_via_temp_file(
                                &src_client,
                                source_bucket,
                                source_key,
                                &dst_client,
                                dest_bucket,
                                dest_key,
                                &cancel_flag,
                                |t, tot| update(t, tot, &mut speed_calc),
                            )
                            .await?
                        };

                        if cancel_flag.load(Ordering::SeqCst) {
                            return Err(JOB_CANCELLED.to_string());
                        }

                        s3_delete_keys(&src_client, source_bucket, &[source_key.clone()]).await?;
                        Ok(transferred)
                    }
                    JobTaskKind::Delete {
                        profile_id,
                        bucket,
                        keys,
                    } => {
                        let profile = profile_for_id(&state, profile_id)?;
                        let client = to_s3_client(&profile)?;
                        update(0, keys.len() as i64, &mut speed_calc);
                        s3_delete_keys(&client, bucket, keys).await?;
                        update(keys.len() as i64, keys.len() as i64, &mut speed_calc);
                        Ok(keys.len() as i64)
                    }
                    JobTaskKind::Archive {
                        profile_id,
                        bucket,
                        keys,
                        common_prefix,
                        destination_path,
                    } => {
                        let profile = profile_for_id(&state, profile_id)?;
                        let client = to_s3_client(&profile)?;
                        let destination = expand_user_path(destination_path);
                        update(0, 0, &mut speed_calc);
                        s3_download_archive_tar_gz(
                            &client,
                            bucket,
                            keys,
                            common_prefix,
                            &destination,
                            &cancel_flag,
                            |t, tot| update(t, tot, &mut speed_calc),
                        )
                        .await
                    }
                }
            }
            .await;

            match result {
                Ok(bytes) => finish_job(
                    &app_handle,
                    &task.id,
                    JobStatus::Completed,
                    None,
                    Some(bytes),
                ),
                Err(err) if err == JOB_CANCELLED => {
                    finish_job(&app_handle, &task.id, JobStatus::Cancelled, Some(err), None)
                }
                Err(err) => finish_job(&app_handle, &task.id, JobStatus::Failed, Some(err), None),
            }

            try_start_queued_jobs(app_handle);
        });
    }
}

pub(crate) fn enqueue_job(
    app: &AppHandle,
    job_type: JobType,
    file_name: String,
    description: String,
    bytes_total: i64,
    kind: JobTaskKind,
) -> Result<String, String> {
    let job_id = Uuid::new_v4().to_string();
    let info = JobInfo {
        id: job_id.clone(),
        job_type,
        status: JobStatus::Queued,
        file_name,
        description,
        bytes_transferred: 0,
        bytes_total: bytes_total.max(0),
        percentage: 0,
        speed: 0,
        eta: 0,
        error: None,
        created_at: now_iso(),
        started_at: None,
        completed_at: None,
    };

    let task = JobTask {
        id: job_id.clone(),
        kind,
    };

    let state = app.state::<AppState>();
    {
        let mut jobs = lock_state(&state.jobs)?;
        jobs.jobs.insert(job_id.clone(), info.clone());
        jobs.order.retain(|id| id != &job_id);
        jobs.order.insert(0, job_id.clone());
        if jobs.order.len() > JOB_ORDER_MAX {
            for removed in jobs.order.split_off(JOB_ORDER_MAX) {
                if !jobs.running.contains(&removed) {
                    jobs.jobs.remove(&removed);
                }
            }
        }
        jobs.queue.push_back(task);
        jobs.cancel_flags
            .insert(job_id.clone(), Arc::new(AtomicBool::new(false)));
    }

    emit_job_progress_event(app, &info);
    try_start_queued_jobs(app.clone());
    Ok(job_id)
}

pub(crate) fn cancel_job(app: &AppHandle, job_id: &str) {
    let mut queued_cancel_snapshot: Option<JobInfo> = None;
    {
        let state = app.state::<AppState>();
        if let Ok(mut jobs) = lock_state(&state.jobs) {
            if let Some(index) = jobs.queue.iter().position(|task| task.id == job_id) {
                jobs.queue.remove(index);
                if let Some(job) = jobs.jobs.get_mut(job_id) {
                    job.status = JobStatus::Cancelled;
                    job.error = Some(JOB_CANCELLED.to_string());
                    job.completed_at = Some(now_iso());
                    queued_cancel_snapshot = Some(job.clone());
                }
                jobs.cancel_flags.remove(job_id);
            } else if let Some(cancel_flag) = jobs.cancel_flags.get(job_id) {
                cancel_flag.store(true, Ordering::SeqCst);
            }
        };
    }

    if let Some(job) = queued_cancel_snapshot {
        emit_job_progress_event(app, &job);
        emit_job_complete_event(app, &job);
        persist_job_history_snapshot(app);
    }
}
