use serde::{Deserialize, Serialize};
use std::fmt;

/// Unique identifier for an entity instance within its type.
#[derive(Debug, Clone, Hash, Eq, PartialEq, Serialize, Deserialize)]
pub struct EntityId(pub String);

impl EntityId {
    pub fn new(id: impl Into<String>) -> Self {
        Self(id.into())
    }
}

impl fmt::Display for EntityId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl AsRef<str> for EntityId {
    fn as_ref(&self) -> &str {
        &self.0
    }
}
