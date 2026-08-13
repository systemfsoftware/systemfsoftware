use async_trait::async_trait;

use crate::error::ClusterError;
use crate::runner_health::RunnerHealth;
use crate::types::RunnerAddress;

/// No-op runner health check that always reports alive.
pub struct NoopRunnerHealth;

#[async_trait]
impl RunnerHealth for NoopRunnerHealth {
    async fn is_alive(&self, _address: &RunnerAddress) -> Result<bool, ClusterError> {
        Ok(true)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn always_alive() {
        let health = NoopRunnerHealth;
        let addr = RunnerAddress::new("127.0.0.1", 9000);
        assert!(health.is_alive(&addr).await.unwrap());
    }
}
