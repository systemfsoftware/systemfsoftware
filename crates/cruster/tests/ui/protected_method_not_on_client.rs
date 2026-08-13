use cruster::{entity, entity_impl};
use cruster::error::ClusterError;
use cruster::types::EntityId;

#[entity]
#[derive(Clone)]
struct ProtectedEntity;

#[entity_impl]
impl ProtectedEntity {
    #[rpc]
    #[protected]
    async fn internal(&self) -> Result<String, ClusterError> {
        Ok("ok".to_string())
    }
}

fn assert_protected_method_missing(client: &ProtectedEntityClient, id: &EntityId) {
    let _ = client.internal(id);
}

fn main() {}
