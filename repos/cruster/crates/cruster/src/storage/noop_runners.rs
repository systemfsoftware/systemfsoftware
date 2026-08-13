use async_trait::async_trait;

use crate::envelope::{Envelope, EnvelopeRequest};
use crate::error::ClusterError;
use crate::message::ReplyReceiver;
use crate::runners::Runners;
use crate::types::RunnerAddress;

/// No-op inter-runner communication that always returns unavailable.
/// Used for single-node / test scenarios where no remote runners exist.
pub struct NoopRunners;

#[async_trait]
impl Runners for NoopRunners {
    async fn ping(&self, address: &RunnerAddress) -> Result<(), ClusterError> {
        Err(ClusterError::RunnerUnavailable {
            address: address.clone(),
            source: None,
        })
    }

    async fn send(
        &self,
        address: &RunnerAddress,
        _envelope: EnvelopeRequest,
    ) -> Result<ReplyReceiver, ClusterError> {
        Err(ClusterError::RunnerUnavailable {
            address: address.clone(),
            source: None,
        })
    }

    async fn notify(
        &self,
        address: &RunnerAddress,
        _envelope: Envelope,
    ) -> Result<(), ClusterError> {
        Err(ClusterError::RunnerUnavailable {
            address: address.clone(),
            source: None,
        })
    }

    async fn on_runner_unavailable(&self, _address: &RunnerAddress) -> Result<(), ClusterError> {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::envelope::EnvelopeRequest;
    use crate::snowflake::Snowflake;
    use crate::types::{EntityAddress, EntityId, EntityType, ShardId};
    use std::collections::HashMap;

    fn test_addr() -> RunnerAddress {
        RunnerAddress::new("127.0.0.1", 9000)
    }

    fn test_envelope() -> EnvelopeRequest {
        EnvelopeRequest {
            request_id: Snowflake(1),
            address: EntityAddress {
                shard_id: ShardId::new("default", 0),
                entity_type: EntityType::new("Test"),
                entity_id: EntityId::new("e-1"),
            },
            tag: "test".into(),
            payload: vec![],
            headers: HashMap::new(),
            span_id: None,
            trace_id: None,
            sampled: None,
            persisted: false,
            uninterruptible: Default::default(),
            deliver_at: None,
        }
    }

    #[tokio::test]
    async fn ping_returns_unavailable() {
        let runners = NoopRunners;
        assert!(runners.ping(&test_addr()).await.is_err());
    }

    #[tokio::test]
    async fn send_returns_unavailable() {
        let runners = NoopRunners;
        assert!(runners.send(&test_addr(), test_envelope()).await.is_err());
    }

    #[tokio::test]
    async fn notify_returns_unavailable() {
        let runners = NoopRunners;
        assert!(runners
            .notify(&test_addr(), Envelope::Request(test_envelope()))
            .await
            .is_err());
    }

    #[tokio::test]
    async fn on_runner_unavailable_is_ok() {
        let runners = NoopRunners;
        assert!(runners.on_runner_unavailable(&test_addr()).await.is_ok());
    }
}
