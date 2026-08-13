use serde::{Deserialize, Serialize};

use crate::types::RunnerAddress;

/// A registered cluster runner.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Runner {
    pub address: RunnerAddress,
    pub weight: i32,
    pub healthy: bool,
}

impl Runner {
    /// Create a new runner with the given address and weight.
    ///
    /// # Panics
    /// Panics if `weight` is negative. Use `weight = 0` for drain mode (no shard assignments).
    pub fn new(address: RunnerAddress, weight: i32) -> Self {
        assert!(
            weight >= 0,
            "Runner weight must be non-negative, got {weight}"
        );
        Self {
            address,
            weight,
            healthy: true,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn addr(host: &str, port: u16) -> RunnerAddress {
        RunnerAddress {
            host: host.to_string(),
            port,
        }
    }

    #[test]
    fn runner_new_with_positive_weight() {
        let runner = Runner::new(addr("localhost", 8080), 5);
        assert_eq!(runner.weight, 5);
        assert!(runner.healthy);
    }

    #[test]
    fn runner_new_with_zero_weight() {
        let runner = Runner::new(addr("localhost", 8080), 0);
        assert_eq!(runner.weight, 0);
    }

    #[test]
    #[should_panic(expected = "Runner weight must be non-negative")]
    fn runner_new_with_negative_weight_panics() {
        Runner::new(addr("localhost", 8080), -1);
    }

    #[test]
    #[should_panic(expected = "Runner weight must be non-negative")]
    fn runner_new_with_large_negative_weight_panics() {
        Runner::new(addr("localhost", 8080), -100);
    }
}
