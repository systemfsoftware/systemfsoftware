use serde::{Deserialize, Serialize};
use std::fmt;

/// Unique type name for a cluster entity (e.g., "User", "Order").
#[derive(Debug, Clone, Hash, Eq, PartialEq, Serialize, Deserialize)]
pub struct EntityType(pub String);

impl EntityType {
    pub fn new(name: impl Into<String>) -> Self {
        Self(name.into())
    }
}

impl fmt::Display for EntityType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl AsRef<str> for EntityType {
    fn as_ref(&self) -> &str {
        &self.0
    }
}
