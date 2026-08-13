use cruster::{entity, entity_impl};

#[entity]
#[derive(Clone)]
struct ActivityEntity;

#[entity_impl]
impl ActivityEntity {
    #[activity]
    #[public]
    async fn bad(&self) -> Result<(), cruster::error::ClusterError> {
        Ok(())
    }
}

fn main() {}
