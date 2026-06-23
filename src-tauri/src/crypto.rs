//! Vault cryptography: key derivation, AES-256-GCM payload encryption, recovery
//! keys, and base64/random helpers. Constants (KEY_BYTES, IV_BYTES, …) live in
//! the crate root and are visible here as a descendant module.

use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use pbkdf2::pbkdf2_hmac;
use rand::RngCore;
use sha2::Sha512;

use super::{IV_BYTES, KEY_BYTES, PBKDF2_ITERATIONS, RECOVERY_KEY_LENGTH};

pub(crate) fn random_bytes<const N: usize>() -> [u8; N] {
    let mut bytes = [0u8; N];
    rand::thread_rng().fill_bytes(&mut bytes);
    bytes
}

pub(crate) fn encode_base64(bytes: &[u8]) -> String {
    BASE64.encode(bytes)
}

pub(crate) fn decode_base64(input: &str) -> Result<Vec<u8>, String> {
    BASE64
        .decode(input)
        .map_err(|err| format!("Invalid base64 payload: {err}"))
}

pub(crate) fn derive_key(passphrase: &str, salt: &[u8]) -> [u8; KEY_BYTES] {
    let mut key = [0u8; KEY_BYTES];
    pbkdf2_hmac::<Sha512>(passphrase.as_bytes(), salt, PBKDF2_ITERATIONS, &mut key);
    key
}

pub(crate) fn encrypt_payload(
    key: &[u8; KEY_BYTES],
    plaintext: &[u8],
) -> Result<(Vec<u8>, Vec<u8>), String> {
    let cipher =
        Aes256Gcm::new_from_slice(key).map_err(|err| format!("Invalid encryption key: {err}"))?;
    let iv = random_bytes::<IV_BYTES>();
    let nonce = Nonce::from_slice(&iv);
    let ciphertext = cipher
        .encrypt(nonce, plaintext)
        .map_err(|_| "Vault encryption failed".to_string())?;

    Ok((iv.to_vec(), ciphertext))
}

pub(crate) fn decrypt_payload(
    key: &[u8; KEY_BYTES],
    iv: &[u8],
    ciphertext: &[u8],
) -> Result<Vec<u8>, String> {
    if iv.len() != IV_BYTES {
        return Err("Invalid vault IV length".to_string());
    }

    let cipher =
        Aes256Gcm::new_from_slice(key).map_err(|err| format!("Invalid encryption key: {err}"))?;
    let nonce = Nonce::from_slice(iv);
    cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| "Invalid passphrase".to_string())
}

pub(crate) fn generate_recovery_key() -> String {
    const CHARS: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let bytes = random_bytes::<RECOVERY_KEY_LENGTH>();
    let mut key = String::with_capacity(RECOVERY_KEY_LENGTH + (RECOVERY_KEY_LENGTH / 4));

    for (idx, byte) in bytes.iter().enumerate() {
        if idx > 0 && idx % 4 == 0 {
            key.push('-');
        }
        key.push(CHARS[(*byte as usize) % CHARS.len()] as char);
    }

    key
}
