use cruster::{entity, entity_impl};

#[entity]
#[derive(Clone)]
struct VisibilityEntity;

#[entity_impl]
impl VisibilityEntity {
    #[private]
    async fn helper(&self) -> Result<(), cruster::error::ClusterError> {
        Ok(())
    }
}

fn main() {}
