//! Cluster annotations for RPC definitions.
//!
//! Replaces Effect's `ServiceMap.Reference` annotations. In Rust, these are
//! marker traits and enum values attached to RPC definitions.
//!
//! Source: `.repos/effect-smol/packages/effect/src/unstable/cluster/ClusterSchema.ts`

use crate::types::EntityId;

/// Whether a message should be persisted to storage before delivery.
///
/// In the TypeScript version this is a boolean annotation via `ServiceMap.Reference`.
/// In Rust, implement this marker trait on RPC request types that should be persisted.
pub trait Persisted {}

/// Uninterruptibility mode for an RPC.
///
/// Controls whether the client, server, or both sides of an RPC call
/// should be uninterruptible (i.e., cannot be cancelled).
#[derive(
    Debug, Clone, Copy, Default, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize,
)]
pub enum Uninterruptible {
    /// Neither side is uninterruptible (default).
    #[default]
    No,
    /// Only the client side is uninterruptible.
    Client,
    /// Only the server side is uninterruptible.
    Server,
    /// Both client and server are uninterruptible.
    Both,
}

impl Uninterruptible {
    /// Returns `true` if the server side is uninterruptible.
    pub fn is_server_uninterruptible(&self) -> bool {
        matches!(self, Uninterruptible::Server | Uninterruptible::Both)
    }

    /// Returns `true` if the client side is uninterruptible.
    pub fn is_client_uninterruptible(&self) -> bool {
        matches!(self, Uninterruptible::Client | Uninterruptible::Both)
    }
}

/// Custom shard group resolver for an entity.
///
/// Override the default shard group assignment by implementing this trait.
/// The resolver maps an entity ID to a shard group name.
pub trait ShardGroupResolver: Send + Sync {
    /// Resolve the shard group for the given entity ID.
    fn resolve(&self, entity_id: &EntityId) -> String;
}

/// Default shard group resolver that always returns `"default"`.
pub struct DefaultShardGroupResolver;

impl ShardGroupResolver for DefaultShardGroupResolver {
    fn resolve(&self, _entity_id: &EntityId) -> String {
        "default".to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn uninterruptible_default_is_no() {
        assert_eq!(Uninterruptible::default(), Uninterruptible::No);
    }

    #[test]
    fn uninterruptible_server_checks() {
        assert!(!Uninterruptible::No.is_server_uninterruptible());
        assert!(!Uninterruptible::Client.is_server_uninterruptible());
        assert!(Uninterruptible::Server.is_server_uninterruptible());
        assert!(Uninterruptible::Both.is_server_uninterruptible());
    }

    #[test]
    fn uninterruptible_client_checks() {
        assert!(!Uninterruptible::No.is_client_uninterruptible());
        assert!(Uninterruptible::Client.is_client_uninterruptible());
        assert!(!Uninterruptible::Server.is_client_uninterruptible());
        assert!(Uninterruptible::Both.is_client_uninterruptible());
    }

    #[test]
    fn default_shard_group_resolver() {
        let resolver = DefaultShardGroupResolver;
        let id = EntityId("test-123".to_string());
        assert_eq!(resolver.resolve(&id), "default");
    }

    #[test]
    fn uninterruptible_serde_roundtrip() {
        for variant in [
            Uninterruptible::No,
            Uninterruptible::Client,
            Uninterruptible::Server,
            Uninterruptible::Both,
        ] {
            let bytes = rmp_serde::to_vec(&variant).unwrap();
            let decoded: Uninterruptible = rmp_serde::from_slice(&bytes).unwrap();
            assert_eq!(decoded, variant);
        }
    }

    // Marker trait test: verify a type can implement Persisted
    struct MyPersistedRequest;
    impl Persisted for MyPersistedRequest {}

    #[test]
    fn persisted_marker_trait_compiles() {
        fn _accepts_persisted<T: Persisted>(_t: &T) {}
        let req = MyPersistedRequest;
        _accepts_persisted(&req);
    }
}
