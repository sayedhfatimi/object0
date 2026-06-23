//! OS keychain access for the optional stored vault passphrase.

use super::*;

pub(crate) fn keyring_entry() -> Result<Entry, String> {
    Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT)
        .map_err(|err| format!("OS keychain unavailable: {err}"))
}

pub(crate) fn read_stored_passphrase() -> KeychainReadResult {
    let entry = match keyring_entry() {
        Ok(entry) => entry,
        Err(err) => return KeychainReadResult::Unavailable(err),
    };

    match entry.get_password() {
        Ok(passphrase) => KeychainReadResult::Available(Some(passphrase)),
        Err(keyring::Error::NoEntry) => KeychainReadResult::Available(None),
        Err(err) => KeychainReadResult::Unavailable(format!("OS keychain read failed: {err}")),
    }
}

pub(crate) fn store_passphrase(passphrase: &str) -> Result<(), String> {
    let entry = keyring_entry()?;
    entry
        .set_password(passphrase)
        .map_err(|err| format!("Failed to save passphrase in OS keychain: {err}"))
}

pub(crate) fn clear_stored_passphrase() -> Result<bool, String> {
    let entry = keyring_entry()?;
    let had_stored = match entry.get_password() {
        Ok(_) => true,
        Err(keyring::Error::NoEntry) => false,
        Err(_) => false,
    };

    match entry.delete_credential() {
        Ok(()) => Ok(had_stored),
        Err(keyring::Error::NoEntry) => Ok(false),
        Err(err) => Err(format!("Failed to clear OS keychain entry: {err}")),
    }
}
