use super::ShardId;
use serde::{Deserialize, Serialize};
use std::fmt;

/// Address of a singleton within the cluster.
#[derive(Debug, Clone, Hash, Eq, PartialEq, Serialize, Deserialize)]
pub struct SingletonAddress {
    pub shard_id: ShardId,
    pub name: String,
}

impl fmt::Display for SingletonAddress {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}/{}", self.shard_id, self.name)
    }
}
