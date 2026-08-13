use async_trait::async_trait;

use crate::envelope::{AckChunk, EnvelopeRequest};
use crate::error::ClusterError;
use crate::message::ReplySender;
use crate::reply::Reply;
use crate::snowflake::Snowflake;
use crate::types::{RunnerAddress, ShardId};

/// Result of saving a message to storage.
#[derive(Debug)]
pub enum SaveResult {
    /// Message saved successfully.
    Success,
    /// Message already exists (duplicate request_id).
    Duplicate {
        /// If a reply already exists for this request, it is returned.
        existing_reply: Option<Reply>,
    },
}

/// Persistent message storage for at-least-once delivery.
#[async_trait]
pub trait MessageStorage: Send + Sync {
    /// Save a request envelope. Returns Duplicate if already exists.
    async fn save_request(&self, envelope: &EnvelopeRequest) -> Result<SaveResult, ClusterError>;

    /// Save a fire-and-forget envelope.
    async fn save_envelope(&self, envelope: &EnvelopeRequest) -> Result<SaveResult, ClusterError>;

    /// Save a reply.
    async fn save_reply(&self, reply: &Reply) -> Result<(), ClusterError>;

    /// Clear replies for a request.
    async fn clear_replies(&self, request_id: Snowflake) -> Result<(), ClusterError>;

    /// Get replies for a request.
    async fn replies_for(&self, request_id: Snowflake) -> Result<Vec<Reply>, ClusterError>;

    /// Get unprocessed messages for given shard IDs.
    async fn unprocessed_messages(
        &self,
        shard_ids: &[ShardId],
    ) -> Result<Vec<EnvelopeRequest>, ClusterError>;

    /// Reset (mark as unprocessed) messages for given shards.
    async fn reset_shards(&self, shard_ids: &[ShardId]) -> Result<(), ClusterError>;

    /// Clear all data for a runner address.
    async fn clear_address(&self, address: &RunnerAddress) -> Result<(), ClusterError>;

    /// Register a reply handler for real-time reply delivery.
    fn register_reply_handler(&self, request_id: Snowflake, sender: ReplySender);

    /// Unregister a reply handler.
    fn unregister_reply_handler(&self, request_id: Snowflake);

    /// Acknowledge a streamed reply chunk so it can be cleared from storage.
    async fn ack_chunk(&self, ack: &AckChunk) -> Result<(), ClusterError> {
        let _ = ack;
        Ok(())
    }

    /// Get unprocessed messages by specific request IDs.
    /// Used by the MailboxFull resumption system to re-fetch messages
    /// that failed to deliver due to full entity mailboxes.
    async fn unprocessed_messages_by_id(
        &self,
        request_ids: &[Snowflake],
    ) -> Result<Vec<EnvelopeRequest>, ClusterError>;

    /// Configure the maximum number of delivery attempts before dead-lettering.
    /// 0 = unlimited. Default is a no-op for storages that do not support it.
    fn set_max_retries(&self, max_retries: u32) {
        let _ = max_retries;
    }
}
