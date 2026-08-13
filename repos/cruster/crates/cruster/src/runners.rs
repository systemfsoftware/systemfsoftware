use async_trait::async_trait;

use crate::envelope::{Envelope, EnvelopeRequest};
use crate::error::ClusterError;
use crate::message::ReplyReceiver;
use crate::types::RunnerAddress;

/// Inter-runner communication trait.
#[async_trait]
pub trait Runners: Send + Sync {
    /// Ping a runner to check liveness.
    async fn ping(&self, address: &RunnerAddress) -> Result<(), ClusterError>;

    /// Send a request to a remote runner, awaiting reply.
    async fn send(
        &self,
        address: &RunnerAddress,
        envelope: EnvelopeRequest,
    ) -> Result<ReplyReceiver, ClusterError>;

    /// Send a fire-and-forget notification to a remote runner.
    async fn notify(&self, address: &RunnerAddress, envelope: Envelope)
        -> Result<(), ClusterError>;

    /// Callback when a runner becomes unavailable.
    async fn on_runner_unavailable(&self, address: &RunnerAddress) -> Result<(), ClusterError>;
}
