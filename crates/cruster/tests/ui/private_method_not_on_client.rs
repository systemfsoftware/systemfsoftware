use cruster::entity;
use cruster::entity_impl;
use cruster::error::ClusterError;
use cruster::types::EntityId;

#[entity]
#[derive(Clone)]
struct PrivateEntity;

#[entity_impl]
impl PrivateEntity {
    #[rpc]
    async fn public(&self) -> Result<String, ClusterError> {
        Ok("ok".to_string())
    }

    #[rpc]
    #[private]
    async fn secret(&self) -> Result<String, ClusterError> {
        Ok("secret".to_string())
    }
}

fn assert_private_method_missing(client: &PrivateEntityClient, id: &EntityId) {
    let _ = client.secret(id);
}

fn main() {}
