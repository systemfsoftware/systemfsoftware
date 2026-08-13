use serde::{Deserialize, Serialize};
use std::fmt;

/// Identifies a shard within a shard group.
#[derive(Debug, Clone, Hash, Eq, PartialEq, Serialize, Deserialize)]
pub struct ShardId {
    pub group: String,
    pub id: i32,
}

impl ShardId {
    pub fn new(group: impl Into<String>, id: i32) -> Self {
        Self {
            group: group.into(),
            id,
        }
    }
}

impl fmt::Display for ShardId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}:{}", self.group, self.id)
    }
}
