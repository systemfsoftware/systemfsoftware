mod entity_address;
mod entity_id;
mod entity_type;
mod machine_id;
mod runner_address;
mod shard_id;
mod singleton_address;

pub use entity_address::EntityAddress;
pub use entity_id::EntityId;
pub use entity_type::EntityType;
pub use machine_id::{MachineId, MachineIdError, MAX_MACHINE_ID};
pub use runner_address::RunnerAddress;
pub use shard_id::ShardId;
pub use singleton_address::SingletonAddress;

#[cfg(test)]
mod tests {
    use super::*;

    macro_rules! serde_round_trip {
        ($name:ident, $val:expr) => {
            mod $name {
                use super::*;

                #[test]
                fn msgpack() {
                    let val = $val;
                    let bytes = rmp_serde::to_vec(&val).unwrap();
                    let decoded = rmp_serde::from_slice(&bytes).unwrap();
                    assert_eq!(val, decoded);
                }

                #[test]
                fn json() {
                    let val = $val;
                    let json = serde_json::to_string(&val).unwrap();
                    let decoded = serde_json::from_str(&json).unwrap();
                    assert_eq!(val, decoded);
                }
            }
        };
    }

    serde_round_trip!(entity_type, EntityType::new("User"));
    serde_round_trip!(entity_id, EntityId::new("abc-123"));
    serde_round_trip!(machine_id, MachineId::validated(42).unwrap());
    serde_round_trip!(shard_id, ShardId::new("default", 7));
    serde_round_trip!(
        entity_address,
        EntityAddress {
            shard_id: ShardId::new("default", 1),
            entity_type: EntityType::new("Order"),
            entity_id: EntityId::new("ord-1"),
        }
    );
    serde_round_trip!(runner_address, RunnerAddress::new("10.0.0.1", 9000));
    serde_round_trip!(
        singleton_address,
        SingletonAddress {
            shard_id: ShardId::new("default", 0),
            name: "cron-scheduler".into(),
        }
    );

    #[test]
    fn shard_id_hash_eq() {
        use std::collections::HashSet;
        let s1 = ShardId::new("default", 1);
        let s2 = ShardId::new("default", 1);
        let s3 = ShardId::new("default", 2);

        assert_eq!(s1, s2);
        assert_ne!(s1, s3);

        let mut set = HashSet::new();
        set.insert(s1.clone());
        set.insert(s2);
        assert_eq!(set.len(), 1);
        set.insert(s3);
        assert_eq!(set.len(), 2);
    }
}
