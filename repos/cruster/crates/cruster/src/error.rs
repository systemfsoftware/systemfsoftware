use crate::snowflake::Snowflake;
use crate::types::{EntityAddress, EntityId, EntityType, RunnerAddress};

/// Errors that can occur in the cluster system.
#[derive(Debug, thiserror::Error)]
pub enum ClusterError {
    #[error("entity {entity_type}/{entity_id} not assigned to this runner")]
    EntityNotAssignedToRunner {
        entity_type: EntityType,
        entity_id: EntityId,
    },

    #[error("malformed message: {reason}")]
    MalformedMessage {
        reason: String,
        #[source]
        source: Option<Box<dyn std::error::Error + Send + Sync>>,
    },

    #[error("persistence error: {reason}")]
    PersistenceError {
        reason: String,
        #[source]
        source: Option<Box<dyn std::error::Error + Send + Sync>>,
    },

    #[error("runner not registered: {address}")]
    RunnerNotRegistered { address: RunnerAddress },

    #[error("runner unavailable: {address}")]
    RunnerUnavailable {
        address: RunnerAddress,
        #[source]
        source: Option<Box<dyn std::error::Error + Send + Sync>>,
    },

    #[error("mailbox full for {address}")]
    MailboxFull { address: EntityAddress },

    #[error("already processing message {request_id}")]
    AlreadyProcessingMessage { request_id: Snowflake },

    #[error("cluster is shutting down")]
    ShuttingDown,

    #[error("invalid configuration: {reason}")]
    InvalidConfig { reason: String },

    #[error(transparent)]
    ClockDriftExceeded(#[from] crate::snowflake::SnowflakeError),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn error_display_messages() {
        let err = ClusterError::EntityNotAssignedToRunner {
            entity_type: EntityType::new("User"),
            entity_id: EntityId::new("123"),
        };
        assert_eq!(
            err.to_string(),
            "entity User/123 not assigned to this runner"
        );

        let err = ClusterError::MalformedMessage {
            reason: "bad payload".into(),
            source: None,
        };
        assert_eq!(err.to_string(), "malformed message: bad payload");
    }

    #[test]
    fn errors_are_send_sync() {
        fn assert_send_sync<T: Send + Sync>() {}
        assert_send_sync::<ClusterError>();
    }
}
