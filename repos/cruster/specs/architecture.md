# Cruster Architecture

A Rust framework for building distributed, stateful entity systems with durable workflows. Ported from [Effect Cluster](https://github.com/Effect-TS/effect-smol/tree/main/packages/effect/src/unstable/cluster).

## Overview

Cruster is a distributed entity/actor framework with:
- Consistent-hashing-based shard assignment
- Persistent messaging with at-least-once delivery
- Singleton management
- Durable workflows with replay
- Cron scheduling
- PostgreSQL for persistence
- etcd for cluster formation and health monitoring

## Key Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Async runtime | Tokio | Consistent with Rust ecosystem |
| Crate structure | Single `cruster` crate | Feature flags for optional backends |
| DI pattern | `Arc<dyn Trait>` | Constructor injection, runtime polymorphism |
| Serialization | serde + MessagePack | Binary efficiency, JSON fallback via serde_json |
| Transport | gRPC (tonic) | Bidirectional streaming, codegen, ecosystem |
| Runner registry | etcd (etcd-client) | Watch/lease support, pluggable via trait |
| Consistent hashing | `hashring` crate | Well-tested, avoids reinventing |

## Core API Model

### State Declaration

Use `#[state(Type)]` on the impl block to declare state. State is always persistent.

```rust
#[entity_impl]
#[state(OrderState)]
impl OrderProcessor {
    fn init(&self, _ctx: &EntityContext) -> Result<OrderState, ClusterError> {
        Ok(OrderState { pending: Vec::new() })
    }
}
```

**Note:** In-memory state was removed because:
1. Only `#[activity]` methods can mutate state (`&mut self`)
2. Activities are journaled and replay on entity rehydration
3. Non-persisted state would be lost on eviction, breaking replay semantics

### Method Types

- `#[rpc]` — Read-only operations, publicly callable
- `#[activity]` — State mutations, requires `&mut self`, journaled
- `#[workflow]` — Orchestrates activities, publicly callable, durable
- `#[method]` — Private sync helpers

### Visibility Modifiers

- `#[public]` — callable from generated client. Only valid on `#[rpc]` and `#[workflow]`.
- `#[protected]` — callable within the entity and by trait-composed methods.
- `#[private]` — callable only within the defining scope.

Defaults:
- `#[rpc]` defaults to `#[public]`
- `#[workflow]` defaults to `#[public]`
- `#[activity]` defaults to `#[private]`
- Unannotated methods are internal helpers and default to `#[private]`

### Locking Rules

- `&self` methods → acquire read lock (concurrent reads allowed)
- `&mut self` methods → acquire write lock (exclusive)

### Idempotency Keys

Default key for `#[workflow]`/`#[activity]` is `hash(method_name, serialized_params)` using MessagePack.

Explicit key override:

```rust
#[workflow(key(|order_id, _body| order_id))]
async fn send_email(&mut self, order_id: OrderId, body: String) -> Result<(), ClusterError> {
    Ok(())
}
```

### Deferreds (Typed)

Use typed deferred keys to avoid mismatched types:

```rust
pub struct Deferred<T>(String, PhantomData<T>);
pub struct DeferredToken<T>(String, PhantomData<T>);
```

Entity API:
- `self.await_deferred<T>(deferred: Deferred<T>) -> Result<T, ClusterError>`
- `self.resolve_deferred<T>(deferred: Deferred<T>, value: T) -> Result<(), ClusterError>`
- `self.deferred_token<T>(deferred: Deferred<T>) -> DeferredToken<T>`

## Module Architecture

### Types

Core identifiers are newtypes/structs:

```rust
pub struct EntityType(pub String);
pub struct EntityId(pub String);
pub struct ShardId { pub group: String, pub id: i32 }
pub struct MachineId(pub i64);
pub struct EntityAddress { pub entity_type: EntityType, pub entity_id: EntityId }
pub struct RunnerAddress { pub host: String, pub port: u16 }
pub struct SingletonAddress { pub name: String }
```

### Snowflake IDs

42-bit timestamp (ms), 10-bit machine ID, 12-bit sequence. Epoch: 2025-01-01T00:00:00Z.

### Envelope / Reply / Message

Wire protocol types:

```rust
pub enum Envelope { 
    Request(EnvelopeRequest), 
    AckChunk(AckChunk), 
    Interrupt(Interrupt) 
}

pub struct EnvelopeRequest {
    pub request_id: Snowflake,
    pub address: EntityAddress,
    pub tag: String,
    pub payload: Vec<u8>,
    pub headers: HashMap<String, String>,
}
```

### Entity Trait

```rust
#[async_trait]
pub trait Entity: Send + Sync + 'static {
    fn entity_type(&self) -> EntityType;
    async fn spawn(&self, ctx: EntityContext) -> Result<Box<dyn EntityHandler>, ClusterError>;
}
```

### Message Storage

Persists requests/replies with duplicate detection:

```rust
#[async_trait]
pub trait MessageStorage: Send + Sync {
    async fn save_request(&self, envelope: &EnvelopeRequest) -> Result<SaveResult, ClusterError>;
    async fn save_reply(&self, reply: &Reply) -> Result<(), ClusterError>;
    async fn unprocessed_messages(&self, shard_ids: &[ShardId]) -> Result<Vec<EnvelopeRequest>, ClusterError>;
}
```

SQL implementation uses `cluster_messages` and `cluster_replies` tables.

### Runner Storage

Manages runner registration and shard locks:

```rust
#[async_trait]
pub trait RunnerStorage: Send + Sync {
    async fn register(&self, runner: &Runner) -> Result<MachineId, ClusterError>;
    async fn acquire(&self, shard_id: &ShardId, runner: &RunnerAddress) -> Result<bool, ClusterError>;
    async fn watch_runners(&self) -> Result<Pin<Box<dyn Stream<Item = Vec<Runner>> + Send>>, ClusterError>;
}
```

etcd implementation uses leases and CAS transactions.

### Sharding

Core orchestrator:

```rust
#[async_trait]
pub trait Sharding: Send + Sync {
    fn get_shard_id(&self, entity_type: &EntityType, entity_id: &EntityId) -> ShardId;
    async fn register_entity(&self, entity: Arc<dyn Entity>) -> Result<(), ClusterError>;
    async fn register_singleton(&self, name: &str, run: SingletonFn) -> Result<(), ClusterError>;
    async fn send(&self, envelope: EnvelopeRequest) -> Result<ReplyReceiver, ClusterError>;
    async fn notify(&self, envelope: EnvelopeRequest) -> Result<(), ClusterError>;
}
```

### Runners (Inter-Runner Communication)

```rust
#[async_trait]
pub trait Runners: Send + Sync {
    async fn ping(&self, address: &RunnerAddress) -> Result<(), ClusterError>;
    async fn send(&self, address: &RunnerAddress, envelope: EnvelopeRequest) -> Result<ReplyReceiver, ClusterError>;
    async fn notify(&self, address: &RunnerAddress, envelope: EnvelopeRequest) -> Result<(), ClusterError>;
}
```

gRPC transport uses tonic streaming.

## Internal Components

### Entity Manager

Manages per-entity instances, mailbox routing, crash recovery, and idempotency tracking.

### Entity Reaper

Cleans up idle entities based on configurable TTL.

### Resource Map

Concurrent lazy initialization for entity instances.

### Cron

`ClusterCron` registers singleton-backed schedules that trigger entity runs.

### Durable Runtime

Internal module providing `sleep`, `await_deferred`, `resolve_deferred`, and `on_interrupt`.

## SQL Schema

Key tables:
- `cluster_messages` - Persisted requests with dedup
- `cluster_replies` - Reply storage for at-least-once delivery
- `cluster_entity_state` - Persisted entity state
- `cluster_workflow_journal` - Workflow step journaling
- `cluster_workflow_timers` - Durable sleep timers
- `cluster_workflow_deferred` - Deferred value storage

## Dependencies

```toml
[dependencies]
tokio = { version = "1", features = ["full"] }
async-trait = "0.1"
tokio-stream = "0.1"
futures = "0.3"
serde = { version = "1", features = ["derive"] }
rmp-serde = "1"
serde_json = "1"
tonic = "0.12"
prost = "0.13"
sqlx = { version = "0.8", features = ["runtime-tokio", "postgres"], optional = true }
etcd-client = { version = "0.14", optional = true }
hashring = "0.3"
thiserror = "1"
dashmap = "6"
prometheus = "0.13"
chrono = { version = "0.4", features = ["serde"] }
cron = "0.13"
tracing = "0.1"

[features]
default = ["sql", "etcd"]
sql = ["dep:sqlx"]
etcd = ["dep:etcd-client"]
```

## Testing

`TestCluster` provides an in-memory single-node cluster for unit tests:

```rust
use cruster::testing::TestCluster;

// Basic cluster
let cluster = TestCluster::new().await;

// With message storage for at-least-once delivery
let cluster = TestCluster::with_message_storage().await;

// Full workflow support
let cluster = TestCluster::with_workflow_support().await;
```
