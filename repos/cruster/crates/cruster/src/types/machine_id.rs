use serde::{Deserialize, Serialize};
use std::fmt;

/// Maximum valid machine ID value (10-bit field: 0-1023).
pub const MAX_MACHINE_ID: i32 = (1 << 10) - 1; // 1023

/// Machine identifier assigned during runner registration.
/// Used as part of snowflake ID generation (10-bit field, valid range 0-1023).
///
/// Values > 1023 overflow into the snowflake sequence field, causing ID collisions
/// across different machine IDs. Use [`MachineId::validated`] for validated construction.
#[derive(Debug, Clone, Copy, Hash, Eq, PartialEq, Serialize, Deserialize)]
pub struct MachineId(i32);

impl MachineId {
    /// Get the inner integer value.
    pub fn value(&self) -> i32 {
        self.0
    }

    /// Create a `MachineId` without validation.
    /// Only for internal use (e.g., snowflake parts extraction where value is already masked).
    pub(crate) fn new_unchecked(id: i32) -> Self {
        Self(id)
    }

    /// Create a new `MachineId` with validation.
    ///
    /// Returns `Err` if the value is outside the valid range `0..=1023`.
    pub fn validated(id: i32) -> Result<Self, MachineIdError> {
        if !(0..=MAX_MACHINE_ID).contains(&id) {
            Err(MachineIdError { value: id })
        } else {
            Ok(Self(id))
        }
    }

    /// Create a new `MachineId` by wrapping the value modulo 1024.
    ///
    /// This is useful for auto-incrementing counters (e.g., etcd machine ID counter)
    /// that may exceed 1023.
    pub fn wrapping(id: i32) -> Self {
        Self(id.rem_euclid(MAX_MACHINE_ID + 1))
    }
}

/// Error returned when a machine ID is outside the valid range 0-1023.
#[derive(Debug, Clone, thiserror::Error)]
#[error("machine ID {value} is out of range (valid: 0..=1023)")]
pub struct MachineIdError {
    pub value: i32,
}

impl fmt::Display for MachineId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validated_accepts_valid_range() {
        assert!(MachineId::validated(0).is_ok());
        assert!(MachineId::validated(512).is_ok());
        assert!(MachineId::validated(1023).is_ok());
    }

    #[test]
    fn validated_rejects_out_of_range() {
        assert!(MachineId::validated(-1).is_err());
        assert!(MachineId::validated(1024).is_err());
        assert!(MachineId::validated(i32::MAX).is_err());
    }

    #[test]
    fn wrapping_modulo_1024() {
        assert_eq!(MachineId::wrapping(0).value(), 0);
        assert_eq!(MachineId::wrapping(1023).value(), 1023);
        assert_eq!(MachineId::wrapping(1024).value(), 0);
        assert_eq!(MachineId::wrapping(1025).value(), 1);
        assert_eq!(MachineId::wrapping(2048).value(), 0);
        assert_eq!(MachineId::wrapping(-1).value(), 1023);
    }

    #[test]
    fn value_getter() {
        let id = MachineId::validated(42).unwrap();
        assert_eq!(id.value(), 42);
    }

    #[test]
    fn error_display() {
        let err = MachineId::validated(9999).unwrap_err();
        assert_eq!(
            err.to_string(),
            "machine ID 9999 is out of range (valid: 0..=1023)"
        );
    }
}
