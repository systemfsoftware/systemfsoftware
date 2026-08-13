use crate::types::MachineId;
use serde::{Deserialize, Serialize};
use std::fmt;
use std::sync::atomic::{AtomicI32, AtomicI64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

/// Error returned when the snowflake generator cannot produce an ID.
#[derive(Debug, thiserror::Error)]
pub enum SnowflakeError {
    /// The system clock jumped backward by more than the maximum tolerable drift.
    #[error(
        "system clock jumped backward by {drift_ms}ms (>{max_drift_ms}ms max) — check NTP configuration"
    )]
    ClockDriftExceeded { drift_ms: i64, max_drift_ms: i64 },
}

/// Custom epoch: 2025-01-01T00:00:00Z in milliseconds since Unix epoch.
const CUSTOM_EPOCH_MS: i64 = 1_735_689_600_000;

/// Maximum tolerable backward clock drift in milliseconds before panicking.
/// If the system clock jumps back by more than this amount, the generator panics
/// rather than blocking the calling thread (likely a tokio runtime thread) indefinitely.
const MAX_CLOCK_DRIFT_MS: i64 = 5_000;

const MACHINE_ID_BITS: u32 = 10;
const SEQUENCE_BITS: u32 = 12;
const MACHINE_ID_SHIFT: u32 = SEQUENCE_BITS;
const TIMESTAMP_SHIFT: u32 = MACHINE_ID_BITS + SEQUENCE_BITS;
const SEQUENCE_MASK: i64 = (1 << SEQUENCE_BITS) - 1;

/// A distributed unique ID using the Snowflake algorithm.
/// Layout: 42-bit timestamp (ms since custom epoch), 10-bit machine ID, 12-bit sequence.
#[derive(Debug, Clone, Copy, Hash, Eq, PartialEq, Ord, PartialOrd, Serialize, Deserialize)]
pub struct Snowflake(pub i64);

impl fmt::Display for Snowflake {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

/// Decomposed parts of a Snowflake ID.
#[derive(Debug, Clone, Copy)]
pub struct SnowflakeParts {
    pub timestamp: i64,
    pub machine_id: MachineId,
    pub sequence: i32,
}

impl Snowflake {
    /// Extract the parts of this snowflake ID.
    pub fn parts(&self) -> SnowflakeParts {
        SnowflakeParts {
            timestamp: (self.0 >> TIMESTAMP_SHIFT) + CUSTOM_EPOCH_MS,
            machine_id: MachineId::new_unchecked(
                ((self.0 >> MACHINE_ID_SHIFT) & ((1 << MACHINE_ID_BITS) - 1)) as i32,
            ),
            sequence: (self.0 & SEQUENCE_MASK) as i32,
        }
    }
}

/// Lock-free snowflake ID generator.
///
/// Uses a single `AtomicI64` (`ts_seq`) to store both the timestamp and sequence
/// atomically, eliminating the race condition where a concurrent thread could read
/// a stale sequence between a timestamp update and sequence reset.
///
/// Layout of `ts_seq`: upper 52 bits = timestamp (ms since Unix epoch), lower 12 bits = sequence.
pub struct SnowflakeGenerator {
    machine_id: AtomicI32,
    /// Combined timestamp (upper 52 bits) and sequence (lower 12 bits).
    ts_seq: AtomicI64,
}

/// Pack timestamp and sequence into a single i64.
fn pack_ts_seq(timestamp: i64, sequence: i64) -> i64 {
    (timestamp << SEQUENCE_BITS) | sequence
}

/// Unpack timestamp from combined value.
fn unpack_timestamp(ts_seq: i64) -> i64 {
    ts_seq >> SEQUENCE_BITS
}

/// Unpack sequence from combined value.
fn unpack_sequence(ts_seq: i64) -> i64 {
    ts_seq & SEQUENCE_MASK
}

impl SnowflakeGenerator {
    pub fn new() -> Self {
        Self {
            machine_id: AtomicI32::new(0),
            // Initialize with timestamp=-1, sequence=0 so first CAS always succeeds
            ts_seq: AtomicI64::new(pack_ts_seq(-1, 0)),
        }
    }

    /// Update the machine ID used for subsequent snowflake generation.
    ///
    /// # Panics
    ///
    /// Panics if `id.0` is outside the valid range `0..=1023`. Use [`MachineId::validated`]
    /// or [`MachineId::wrapping`] to ensure valid values.
    pub fn set_machine_id(&self, id: MachineId) {
        assert!(
            id.value() >= 0 && id.value() <= crate::types::MAX_MACHINE_ID,
            "machine ID {} is out of range (valid: 0..=1023)",
            id.value()
        );
        self.machine_id.store(id.value(), Ordering::Release);
    }

    fn current_timestamp() -> i64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock before Unix epoch")
            .as_millis() as i64
    }

    /// Generate the next unique snowflake ID asynchronously. Lock-free.
    /// On clock drift or sequence exhaustion, yields to the tokio runtime
    /// instead of blocking the worker thread.
    ///
    /// Returns `Err(SnowflakeError::ClockDriftExceeded)` if the system clock
    /// has jumped backward by more than 5 seconds.
    ///
    /// Prefer this over [`next()`](Self::next) in async contexts.
    pub async fn next_async(&self) -> Result<Snowflake, SnowflakeError> {
        loop {
            let timestamp = Self::current_timestamp();
            let current = self.ts_seq.load(Ordering::Acquire);
            let last_ts = unpack_timestamp(current);

            if timestamp < last_ts {
                let drift_ms = last_ts - timestamp;
                if drift_ms > MAX_CLOCK_DRIFT_MS {
                    return Err(SnowflakeError::ClockDriftExceeded {
                        drift_ms,
                        max_drift_ms: MAX_CLOCK_DRIFT_MS,
                    });
                }
                if drift_ms > 100 {
                    tracing::warn!(
                        drift_ms,
                        "snowflake: system clock jumped backward, waiting for clock to catch up"
                    );
                }
                tokio::task::yield_now().await;
                continue;
            }

            let (new_val, seq) = if timestamp == last_ts {
                let seq = unpack_sequence(current) + 1;
                if seq > SEQUENCE_MASK {
                    tokio::task::yield_now().await;
                    continue;
                }
                (pack_ts_seq(timestamp, seq), seq)
            } else {
                (pack_ts_seq(timestamp, 0), 0)
            };

            let machine_id = self.machine_id.load(Ordering::Acquire);

            if self
                .ts_seq
                .compare_exchange(current, new_val, Ordering::AcqRel, Ordering::Relaxed)
                .is_err()
            {
                continue;
            }
            let id = ((timestamp - CUSTOM_EPOCH_MS) << TIMESTAMP_SHIFT)
                | ((machine_id as i64) << MACHINE_ID_SHIFT)
                | seq;

            return Ok(Snowflake(id));
        }
    }

    /// Generate the next unique snowflake ID. Lock-free.
    /// On clock drift (backward clock), waits until the clock catches up.
    ///
    /// **Warning:** This method uses `std::thread::yield_now()` on contention,
    /// which blocks the calling OS thread. In async contexts, prefer
    /// [`next_async()`](Self::next_async) to avoid blocking tokio worker threads.
    ///
    /// Returns `Err(SnowflakeError::ClockDriftExceeded)` if the system clock
    /// has jumped backward by more than 5 seconds.
    ///
    /// Uses a single atomic CAS on a combined timestamp+sequence value to
    /// eliminate the race between timestamp update and sequence reset.
    pub fn next(&self) -> Result<Snowflake, SnowflakeError> {
        loop {
            let timestamp = Self::current_timestamp();
            let current = self.ts_seq.load(Ordering::Acquire);
            let last_ts = unpack_timestamp(current);

            if timestamp < last_ts {
                let drift_ms = last_ts - timestamp;
                if drift_ms > MAX_CLOCK_DRIFT_MS {
                    return Err(SnowflakeError::ClockDriftExceeded {
                        drift_ms,
                        max_drift_ms: MAX_CLOCK_DRIFT_MS,
                    });
                }
                if drift_ms > 100 {
                    tracing::warn!(
                        drift_ms,
                        "snowflake: system clock jumped backward, waiting for clock to catch up"
                    );
                }
                // Yield to other threads/tasks until the clock catches up.
                // Using yield_now() instead of spin_loop() to avoid blocking the
                // tokio runtime thread during backward clock drift (e.g., small NTP correction).
                std::thread::yield_now();
                continue;
            }

            let (new_val, seq) = if timestamp == last_ts {
                let seq = unpack_sequence(current) + 1;
                if seq > SEQUENCE_MASK {
                    // Sequence exhausted for this millisecond — yield and wait for next ms.
                    // Using yield_now() instead of spin_loop() to avoid blocking the
                    // tokio runtime thread during burst ID generation (>4096/ms).
                    std::thread::yield_now();
                    continue;
                }
                (pack_ts_seq(timestamp, seq), seq)
            } else {
                // New millisecond — reset sequence to 0
                (pack_ts_seq(timestamp, 0), 0)
            };

            // Capture machine_id before CAS to ensure the ID uses the machine_id
            // that was active when the slot was reserved (not one set concurrently
            // via set_machine_id between CAS and composition).
            let machine_id = self.machine_id.load(Ordering::Acquire);

            // Atomically update both timestamp and sequence together
            if self
                .ts_seq
                .compare_exchange(current, new_val, Ordering::AcqRel, Ordering::Relaxed)
                .is_err()
            {
                continue; // Another thread updated; retry
            }
            let id = ((timestamp - CUSTOM_EPOCH_MS) << TIMESTAMP_SHIFT)
                | ((machine_id as i64) << MACHINE_ID_SHIFT)
                | seq;

            return Ok(Snowflake(id));
        }
    }
}

impl Default for SnowflakeGenerator {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn uniqueness() {
        let gen = SnowflakeGenerator::new();
        let ids: Vec<Snowflake> = (0..10_000).map(|_| gen.next().unwrap()).collect();
        let unique: HashSet<_> = ids.iter().collect();
        assert_eq!(unique.len(), ids.len(), "all IDs must be unique");
    }

    #[test]
    fn monotonicity() {
        let gen = SnowflakeGenerator::new();
        let mut prev = gen.next().unwrap();
        for _ in 0..1_000 {
            let next = gen.next().unwrap();
            assert!(next > prev, "IDs must be strictly increasing");
            prev = next;
        }
    }

    #[test]
    fn parts_round_trip() {
        let gen = SnowflakeGenerator::new();
        gen.set_machine_id(MachineId::new_unchecked(42));
        let id = gen.next().unwrap();
        let parts = id.parts();
        assert_eq!(parts.machine_id, MachineId::new_unchecked(42));
        assert!(parts.timestamp > CUSTOM_EPOCH_MS);
    }

    #[test]
    fn machine_id_update() {
        let gen = SnowflakeGenerator::new();
        let id1 = gen.next().unwrap();
        assert_eq!(id1.parts().machine_id, MachineId::new_unchecked(0));

        gen.set_machine_id(MachineId::new_unchecked(7));
        // Need a new millisecond to see the change reliably
        std::thread::sleep(std::time::Duration::from_millis(2));
        let id2 = gen.next().unwrap();
        assert_eq!(id2.parts().machine_id, MachineId::new_unchecked(7));
    }

    #[test]
    fn serde_round_trip() {
        let sf = Snowflake(123456789);
        let bytes = rmp_serde::to_vec(&sf).unwrap();
        let decoded: Snowflake = rmp_serde::from_slice(&bytes).unwrap();
        assert_eq!(sf, decoded);

        let json = serde_json::to_string(&sf).unwrap();
        let decoded: Snowflake = serde_json::from_str(&json).unwrap();
        assert_eq!(sf, decoded);
    }

    #[test]
    #[should_panic(expected = "out of range")]
    fn set_machine_id_rejects_overflow() {
        let gen = SnowflakeGenerator::new();
        gen.set_machine_id(MachineId::new_unchecked(1024));
    }

    #[test]
    #[should_panic(expected = "out of range")]
    fn set_machine_id_rejects_negative() {
        let gen = SnowflakeGenerator::new();
        gen.set_machine_id(MachineId::new_unchecked(-1));
    }

    #[test]
    fn set_machine_id_accepts_max_valid() {
        let gen = SnowflakeGenerator::new();
        gen.set_machine_id(MachineId::new_unchecked(1023));
        std::thread::sleep(std::time::Duration::from_millis(2));
        let id = gen.next().unwrap();
        assert_eq!(id.parts().machine_id, MachineId::new_unchecked(1023));
    }

    #[test]
    fn concurrent_uniqueness() {
        use std::sync::Arc;
        let gen = Arc::new(SnowflakeGenerator::new());
        let mut handles = vec![];
        for _ in 0..4 {
            let g = gen.clone();
            handles.push(std::thread::spawn(move || {
                (0..2_500).map(|_| g.next().unwrap()).collect::<Vec<_>>()
            }));
        }
        let mut all_ids = HashSet::new();
        for h in handles {
            for id in h.join().unwrap() {
                assert!(all_ids.insert(id), "duplicate ID found in concurrent test");
            }
        }
        assert_eq!(all_ids.len(), 10_000);
    }

    #[tokio::test]
    async fn next_async_uniqueness() {
        let gen = SnowflakeGenerator::new();
        let mut ids = HashSet::new();
        for _ in 0..1_000 {
            let id = gen.next_async().await.unwrap();
            assert!(ids.insert(id), "duplicate ID from next_async");
        }
        assert_eq!(ids.len(), 1_000);
    }

    #[tokio::test]
    async fn next_async_monotonicity() {
        let gen = SnowflakeGenerator::new();
        let mut prev = gen.next_async().await.unwrap();
        for _ in 0..100 {
            let next = gen.next_async().await.unwrap();
            assert!(next > prev, "next_async IDs must be strictly increasing");
            prev = next;
        }
    }
}
