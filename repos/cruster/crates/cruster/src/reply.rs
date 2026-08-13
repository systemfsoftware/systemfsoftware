use crate::hash::djb2_hash64;
use crate::snowflake::Snowflake;
use serde::{Deserialize, Serialize};

/// Reply types sent back from entity handlers.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Reply {
    WithExit(ReplyWithExit),
    Chunk(ReplyChunk),
}

/// A final reply with an exit result.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReplyWithExit {
    pub request_id: Snowflake,
    pub id: Snowflake,
    pub exit: ExitResult,
}

/// A streamed chunk reply.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReplyChunk {
    pub request_id: Snowflake,
    pub id: Snowflake,
    pub sequence: i32,
    /// MessagePack-encoded values.
    pub values: Vec<Vec<u8>>,
}

/// Sequence value reserved for exit replies in storage.
pub(crate) const EXIT_SEQUENCE: i32 = i32::MAX;

/// Result of processing a request.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ExitResult {
    Success(Vec<u8>),
    Failure(String),
}

impl Reply {
    /// Get the request ID this reply is for.
    pub fn request_id(&self) -> Snowflake {
        match self {
            Reply::WithExit(r) => r.request_id,
            Reply::Chunk(r) => r.request_id,
        }
    }
}

/// Generate a deterministic fallback reply ID based on request + sequence.
pub fn fallback_reply_id(request_id: Snowflake, sequence: i32) -> Snowflake {
    let mut bytes = [0u8; 12];
    bytes[..8].copy_from_slice(&request_id.0.to_be_bytes());
    bytes[8..].copy_from_slice(&sequence.to_be_bytes());
    let hash = djb2_hash64(&bytes);
    Snowflake((hash & i64::MAX as u64) as i64)
}

/// Generate a deterministic reply ID for dead-letter exits.
pub fn dead_letter_reply_id(request_id: Snowflake) -> Snowflake {
    Snowflake(-request_id.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reply_with_exit_serde_roundtrip() {
        let reply = Reply::WithExit(ReplyWithExit {
            request_id: Snowflake(100),
            id: Snowflake(200),
            exit: ExitResult::Success(vec![1, 2, 3]),
        });
        let bytes = rmp_serde::to_vec(&reply).unwrap();
        let decoded: Reply = rmp_serde::from_slice(&bytes).unwrap();
        match decoded {
            Reply::WithExit(r) => {
                assert_eq!(r.request_id, Snowflake(100));
                assert!(matches!(r.exit, ExitResult::Success(_)));
            }
            _ => panic!("expected WithExit"),
        }
    }

    #[test]
    fn reply_chunk_serde_roundtrip() {
        let reply = Reply::Chunk(ReplyChunk {
            request_id: Snowflake(300),
            id: Snowflake(400),
            sequence: 0,
            values: vec![vec![10], vec![20]],
        });
        let bytes = rmp_serde::to_vec(&reply).unwrap();
        let decoded: Reply = rmp_serde::from_slice(&bytes).unwrap();
        match decoded {
            Reply::Chunk(r) => {
                assert_eq!(r.sequence, 0);
                assert_eq!(r.values.len(), 2);
            }
            _ => panic!("expected Chunk"),
        }
    }

    #[test]
    fn exit_failure_roundtrip() {
        let reply = Reply::WithExit(ReplyWithExit {
            request_id: Snowflake(500),
            id: Snowflake(600),
            exit: ExitResult::Failure("something went wrong".into()),
        });
        let bytes = rmp_serde::to_vec(&reply).unwrap();
        let decoded: Reply = rmp_serde::from_slice(&bytes).unwrap();
        match decoded {
            Reply::WithExit(r) => match r.exit {
                ExitResult::Failure(msg) => assert_eq!(msg, "something went wrong"),
                _ => panic!("expected Failure"),
            },
            _ => panic!("expected WithExit"),
        }
    }

    #[test]
    fn request_id_accessor() {
        let r1 = Reply::WithExit(ReplyWithExit {
            request_id: Snowflake(10),
            id: Snowflake(20),
            exit: ExitResult::Success(vec![]),
        });
        assert_eq!(r1.request_id(), Snowflake(10));

        let r2 = Reply::Chunk(ReplyChunk {
            request_id: Snowflake(30),
            id: Snowflake(40),
            sequence: 0,
            values: vec![],
        });
        assert_eq!(r2.request_id(), Snowflake(30));
    }
}
