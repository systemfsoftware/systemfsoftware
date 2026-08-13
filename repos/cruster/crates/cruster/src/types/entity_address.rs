use super::{EntityId, EntityType, ShardId};
use serde::{Deserialize, Serialize};
use std::fmt;

/// Full address of an entity instance: shard + type + id.
#[derive(Debug, Clone, Hash, Eq, PartialEq, Serialize, Deserialize)]
pub struct EntityAddress {
    pub shard_id: ShardId,
    pub entity_type: EntityType,
    pub entity_id: EntityId,
}

impl fmt::Display for EntityAddress {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "{}/{}/{}",
            self.shard_id, self.entity_type, self.entity_id
        )
    }
}
