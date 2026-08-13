use async_trait::async_trait;

use crate::error::ClusterError;
use crate::types::RunnerAddress;

/// Trait for checking runner liveness.
#[async_trait]
pub trait RunnerHealth: Send + Sync {
    async fn is_alive(&self, address: &RunnerAddress) -> Result<bool, ClusterError>;
}
