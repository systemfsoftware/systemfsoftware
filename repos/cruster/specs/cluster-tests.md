# Cluster Tests Specification

## Overview

A dedicated test project that validates all cruster features against a live cluster deployment. The project is a runner binary that joins the cluster, registers purpose-built test entities, and exposes an HTTP API. Tests are bash scripts that exercise the API and validate cluster behavior.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Live Cluster                             │
│  ┌──────────────────────────────────────┐                       │
│  │       cluster-tests runner           │                       │
│  │  - Test entities (Counter, etc.)     │                       │
│  │  - HTTP API :8080                    │◀──── curl/bash tests  │
│  └──────────────────────────────────────┘                       │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐                │
│  │   Runner1   │ │   Runner2   │ │   Runner3   │  (production)  │
│  └─────────────┘ └─────────────┘ └─────────────┘                │
│  ┌──────────┐  ┌──────────────┐                                 │
│  │   etcd   │  │   postgres   │                                 │
│  └──────────┘  └──────────────┘                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Project Structure

```
examples/cluster-tests/
├── Cargo.toml
├── src/
│   ├── main.rs                    # Runner binary with HTTP API
│   ├── api.rs                     # HTTP route handlers
│   └── entities/
│       ├── mod.rs
│       ├── counter.rs             # Basic state persistence
│       ├── kv_store.rs            # Key-value operations
│       ├── workflow_test.rs       # Durable workflow testing
│       ├── activity_test.rs       # Activity journaling
│       ├── trait_test.rs          # Entity trait composition
│       ├── timer_test.rs          # Timer/scheduling
│       ├── cross_entity.rs        # Entity-to-entity calls
│       └── singleton_test.rs      # Singleton entity behavior
└── tests/
    ├── e2e.sh                     # Main test runner script
    ├── test_basic.sh              # Basic entity operations
    ├── test_persistence.sh        # State persistence
    ├── test_workflows.sh          # Durable workflows
    ├── test_activities.sh         # Activity journaling
    ├── test_traits.sh             # Entity traits
    ├── test_timers.sh             # Timers and scheduling
    ├── test_cross_entity.sh       # Entity interactions
    ├── test_singletons.sh         # Singleton behavior
    └── lib/
        └── helpers.sh             # Common test utilities
```

## Test Entities

### 1. Counter

Basic entity for testing state persistence and simple RPCs.

**State:**
```rust
struct CounterState {
    value: i64,
}
```

**RPCs:**
- `increment(amount: i64) -> i64` - Add to counter, return new value
- `decrement(amount: i64) -> i64` - Subtract from counter, return new value
- `get() -> i64` - Get current value
- `reset() -> ()` - Reset to zero

**Tests:**
- State persists across calls
- State survives entity eviction and reload
- Concurrent increments are serialized correctly

### 2. KVStore

Key-value store for testing more complex state operations.

**State:**
```rust
struct KVStoreState {
    data: HashMap<String, JsonValue>,
}
```

**RPCs:**
- `set(key: String, value: JsonValue) -> ()` 
- `get(key: String) -> Option<JsonValue>`
- `delete(key: String) -> bool`
- `list_keys() -> Vec<String>`
- `clear() -> ()`

**Tests:**
- CRUD operations work correctly
- Large values handled properly
- Many keys performant

### 3. WorkflowTest

Entity for testing durable workflow execution and replay.

**State:**
```rust
struct WorkflowTestState {
    executions: Vec<WorkflowExecution>,
}

struct WorkflowExecution {
    id: String,
    steps_completed: Vec<String>,
    result: Option<String>,
}
```

**Workflows:**
- `run_simple_workflow(id: String) -> String` - Execute 3 steps, return result
- `run_failing_workflow(id: String, fail_at_step: usize) -> String` - Fail at specific step
- `run_long_workflow(id: String, steps: usize) -> String` - Execute N steps

**RPCs:**
- `get_execution(id: String) -> Option<WorkflowExecution>`
- `list_executions() -> Vec<WorkflowExecution>`

**Tests:**
- Workflow completes all steps
- Workflow replays correctly after runner restart
- Failed workflow can be retried
- Steps are idempotent on replay

### 4. ActivityTest

Entity for testing activity journaling and transactional state.

**State:**
```rust
struct ActivityTestState {
    activity_log: Vec<ActivityRecord>,
}

struct ActivityRecord {
    id: String,
    action: String,
    timestamp: DateTime<Utc>,
}
```

**Workflows:**
- `run_with_activities(id: String) -> Vec<String>` - Run workflow with multiple activities

**Activities:**
- `log_activity(id: String, action: String) -> ()` - Log an activity (mutates state)
- `external_call(url: String) -> String` - Simulate external side effect

**RPCs:**
- `get_activity_log() -> Vec<ActivityRecord>`

**Tests:**
- Activities are journaled
- Activities replay correctly (not re-executed)
- Activity state mutations are transactional

### 5. TraitTest

Entity for testing entity trait composition.

**Traits:**
- Uses `Auditable` trait for audit logging
- Custom `Versioned` trait for optimistic concurrency

**State:**
```rust
struct TraitTestState {
    data: String,
}
```

**RPCs:**
- `update(data: String) -> ()` - Update data (logs via Auditable)
- `get() -> String` - Get current data
- `get_audit_log() -> Vec<AuditEntry>` - From Auditable trait
- `get_version() -> u64` - From Versioned trait

**Tests:**
- Trait methods accessible on entity
- Trait state persisted alongside entity state
- Multiple traits compose correctly

### 6. TimerTest

Entity for testing timers and scheduled execution.

**State:**
```rust
struct TimerTestState {
    timer_fires: Vec<TimerFire>,
}

struct TimerFire {
    timer_id: String,
    scheduled_at: DateTime<Utc>,
    fired_at: DateTime<Utc>,
}
```

**RPCs:**
- `schedule_timer(id: String, delay_ms: u64) -> ()` - Schedule a timer
- `cancel_timer(id: String) -> bool` - Cancel pending timer
- `get_timer_fires() -> Vec<TimerFire>` - Get fired timers
- `clear_fires() -> ()` - Clear history

**Tests:**
- Timer fires after delay
- Timer can be cancelled
- Timer survives runner restart
- Multiple timers handled correctly

### 7. CrossEntity

Entity for testing entity-to-entity communication.

**State:**
```rust
struct CrossEntityState {
    received_messages: Vec<Message>,
}

struct Message {
    from_entity: String,
    content: String,
    timestamp: DateTime<Utc>,
}
```

**RPCs:**
- `send_to(target_type: String, target_id: String, message: String) -> ()` - Send message to another entity
- `receive(from: String, message: String) -> ()` - Receive a message
- `get_messages() -> Vec<Message>` - Get received messages
- `ping_pong(partner_id: String, count: u32) -> u32` - Ping-pong with another entity

**Tests:**
- Entity can call another entity
- Circular calls handled (A -> B -> A)
- Cross-shard communication works

### 8. SingletonTest

A proper cluster singleton using `register_singleton` for testing cluster-wide singleton behavior.
Unlike entities, this runs as a background task on exactly one runner in the cluster.

**Implementation:**
Uses `SingletonManager` which:
- Registers a singleton background task via `register_singleton`
- The singleton task runs continuously on the runner that owns the computed shard
- When the runner dies, the singleton migrates to another runner (recorded as leadership change)
- Shared state is accessed via `Arc<Mutex<>>` for the leader history and `AtomicU64` for the sequence counter

**State (in-memory, not persisted):**
```rust
struct SingletonState {
    leader_history: Vec<LeaderRecord>,
    current_runner: Option<String>,
}

// Atomic for lock-free sequence access
sequence: AtomicU64

struct LeaderRecord {
    runner_id: String,
    became_leader_at: DateTime<Utc>,
    lost_leadership_at: Option<DateTime<Utc>>,
}
```

**Methods (not RPCs - direct calls via SingletonManager):**
- `get_next_sequence() -> u64` - Get next global sequence number (atomic)
- `get_leader_history() -> Vec<LeaderRecord>` - Leadership changes
- `get_current_runner() -> String` - Which runner currently hosts the singleton
- `clear_history()` - Clear leadership history (for testing)
- `reset_sequence()` - Reset sequence counter (for testing only)

**Tests:**
- Only one instance cluster-wide (guaranteed by `register_singleton`)
- Sequence numbers never duplicate (atomic counter)
- Leadership transfers on runner failure (automatic via shard reassignment)

## HTTP API

All endpoints use JSON for request/response bodies.

### Counter
```
POST /counter/{id}/increment     Body: i64           Response: i64
POST /counter/{id}/decrement     Body: i64           Response: i64
GET  /counter/{id}                                   Response: i64
POST /counter/{id}/reset                             Response: null
```

### KVStore
```
POST /kv/{id}/set                Body: {key, value}  Response: null
GET  /kv/{id}/get/{key}                              Response: JsonValue | null
DELETE /kv/{id}/delete/{key}                         Response: bool
GET  /kv/{id}/keys                                   Response: [String]
POST /kv/{id}/clear                                  Response: null
```

### WorkflowTest
```
POST /workflow/{id}/run-simple         Body: {exec_id}            Response: String
POST /workflow/{id}/run-failing        Body: {exec_id, fail_at}   Response: String
POST /workflow/{id}/run-long           Body: {exec_id, steps}     Response: String
GET  /workflow/{id}/execution/{exec_id}                           Response: WorkflowExecution
GET  /workflow/{id}/executions                                    Response: [WorkflowExecution]
```

### ActivityTest
```
POST /activity/{id}/run          Body: {exec_id}     Response: [String]
GET  /activity/{id}/log                              Response: [ActivityRecord]
```

### TraitTest
```
POST /trait/{id}/update          Body: {data}        Response: null
GET  /trait/{id}                                     Response: String
GET  /trait/{id}/audit-log                           Response: [AuditEntry]
GET  /trait/{id}/version                             Response: u64
```

### TimerTest
```
POST /timer/{id}/schedule        Body: {timer_id, delay_ms}  Response: null
POST /timer/{id}/cancel          Body: {timer_id}            Response: bool
GET  /timer/{id}/fires                                       Response: [TimerFire]
POST /timer/{id}/clear-fires                                 Response: null
```

### CrossEntity
```
POST /cross/{id}/send            Body: {target_type, target_id, message}  Response: null
POST /cross/{id}/receive         Body: {from, message}                     Response: null
GET  /cross/{id}/messages                                                  Response: [Message]
POST /cross/{id}/ping-pong       Body: {partner_id, count}                Response: u32
```

### SingletonTest (uses register_singleton)
```
POST /singleton/next-sequence                        Response: u64
GET  /singleton/leader-history                       Response: [LeaderRecord]
GET  /singleton/current-runner                       Response: String
POST /singleton/clear-history                        Response: null
POST /singleton/reset-sequence                       Response: null
```
Note: Leadership is tracked automatically when the singleton migrates between runners.

### Health/Debug
```
GET  /health                                         Response: {status: "ok"}
GET  /debug/shards                                   Response: [ShardInfo]
GET  /debug/entities                                 Response: [EntityInfo]
```

## Test Scripts

### helpers.sh

```bash
#!/bin/bash

BASE_URL="${CLUSTER_TESTS_URL:-http://localhost:8080}"

# HTTP helpers
post() { curl -sf -X POST "$BASE_URL$1" -H "Content-Type: application/json" -d "$2"; }
get() { curl -sf "$BASE_URL$1"; }
delete() { curl -sf -X DELETE "$BASE_URL$1"; }

# Assertions
assert_eq() {
    if [ "$1" != "$2" ]; then
        echo "FAIL: expected '$2', got '$1'"
        exit 1
    fi
}

assert_contains() {
    if [[ "$1" != *"$2"* ]]; then
        echo "FAIL: expected '$1' to contain '$2'"
        exit 1
    fi
}

# Test lifecycle
test_start() { echo "=== $1 ==="; }
test_pass() { echo "PASS: $1"; }
test_fail() { echo "FAIL: $1"; exit 1; }
```

### test_basic.sh

```bash
#!/bin/bash
set -e
source "$(dirname "$0")/lib/helpers.sh"

test_start "Basic Counter Operations"

# Increment
RESULT=$(post "/counter/test1/increment" "5")
assert_eq "$RESULT" "5"
test_pass "increment returns new value"

# Get
RESULT=$(get "/counter/test1")
assert_eq "$RESULT" "5"
test_pass "get returns current value"

# Multiple increments
post "/counter/test1/increment" "3" > /dev/null
RESULT=$(get "/counter/test1")
assert_eq "$RESULT" "8"
test_pass "multiple increments accumulate"

# Decrement
RESULT=$(post "/counter/test1/decrement" "2")
assert_eq "$RESULT" "6"
test_pass "decrement works"

# Reset
post "/counter/test1/reset" "{}" > /dev/null
RESULT=$(get "/counter/test1")
assert_eq "$RESULT" "0"
test_pass "reset works"

# Different entity IDs are independent
post "/counter/test2/increment" "100" > /dev/null
RESULT=$(get "/counter/test1")
assert_eq "$RESULT" "0"
RESULT=$(get "/counter/test2")
assert_eq "$RESULT" "100"
test_pass "entity IDs are independent"

echo "All basic tests passed"
```

### e2e.sh (Main Runner)

```bash
#!/bin/bash
set -e

SCRIPT_DIR="$(dirname "$0")"

echo "========================================="
echo "Cluster E2E Tests"
echo "========================================="
echo "Target: ${CLUSTER_TESTS_URL:-http://localhost:8080}"
echo ""

# Health check
echo "Checking cluster health..."
if ! curl -sf "${CLUSTER_TESTS_URL:-http://localhost:8080}/health" > /dev/null; then
    echo "FAIL: cluster not healthy"
    exit 1
fi
echo "Cluster healthy"
echo ""

# Run all test suites
"$SCRIPT_DIR/test_basic.sh"
"$SCRIPT_DIR/test_persistence.sh"
"$SCRIPT_DIR/test_workflows.sh"
"$SCRIPT_DIR/test_activities.sh"
"$SCRIPT_DIR/test_traits.sh"
"$SCRIPT_DIR/test_timers.sh"
"$SCRIPT_DIR/test_cross_entity.sh"
"$SCRIPT_DIR/test_singletons.sh"

echo ""
echo "========================================="
echo "All E2E tests passed!"
echo "========================================="
```

## Configuration

The cluster-tests binary uses environment variables:

| Variable | Description | Required |
|----------|-------------|----------|
| `ETCD_ENDPOINTS` | etcd cluster endpoints | Yes |
| `POSTGRES_URL` | PostgreSQL connection string | Yes |
| `LISTEN_ADDR` | HTTP API listen address | No (default: `0.0.0.0:8080`) |
| `RUST_LOG` | Log level | No (default: `info`) |

## Success Criteria

All test scripts pass, validating:

1. **Basic Operations** - Entity spawn, RPC, state read/write
2. **Persistence** - State survives eviction and reload
3. **Workflows** - Durable execution with step journaling
4. **Activities** - Transactional state mutations, replay safety
5. **Traits** - Trait composition and cross-module usage
6. **Timers** - Scheduled execution, cancellation
7. **Cross-Entity** - Entity-to-entity communication
8. **Singletons** - Cluster-wide unique instance
9. **Sharding** - Requests route to correct shard owner

## Future Extensions

- **Failure injection tests** - Restart runners mid-test
- **Performance tests** - Throughput and latency benchmarks
- **Chaos tests** - Random failures, network delays
- **Multi-region tests** - Cross-datacenter behavior

## Implementation Status

### Phase 1: Project Structure and Counter Entity
- [x] Create `examples/cluster-tests/Cargo.toml`
- [x] Create `src/main.rs` with HTTP server and TestCluster setup
- [x] Create `src/api.rs` with HTTP route handlers
- [x] Create `src/entities/mod.rs`
- [x] Implement `Counter` entity with increment/decrement/get/reset RPCs
- [x] Add Counter HTTP routes (`/counter/{id}/*`)

### Phase 2: Additional Test Entities
- [x] Implement `KVStore` entity
- [x] Implement `WorkflowTest` entity
- [x] Implement `ActivityTest` entity
- [x] Implement `TraitTest` entity
- [x] Implement `TimerTest` entity
- [x] Implement `CrossEntity` entity
- [x] Implement `SingletonTest` entity

### Phase 3: HTTP API Completion
- [x] Add all entity HTTP routes
- [x] Add `/health` endpoint
- [x] Add `/debug/shards` and `/debug/entities` endpoints

### Phase 4: Bash Test Scripts
- [x] Create `tests/lib/helpers.sh`
- [x] Create `test_basic.sh`
- [x] Create `test_persistence.sh`
- [x] Create `test_workflows.sh`
- [x] Create `test_activities.sh`
- [x] Create `test_traits.sh`
- [x] Create `test_timers.sh`
- [x] Create `test_cross_entity.sh`
- [x] Create `test_singletons.sh`
- [x] Create `e2e.sh` main runner

### Phase 5: Real Cluster Support
- [x] Add `etcd` feature and `etcd-client` dependency to Cargo.toml
- [x] Implement real Postgres/etcd cluster connection when `POSTGRES_URL` and `ETCD_ENDPOINTS` are provided
- [x] Support `RUNNER_ADDRESS` environment variable for multi-runner mode
- [x] Start gRPC server for inter-runner communication
- [x] Refactor `SingletonTest` to use cluster's `register_singleton` feature (true singleton)
- [x] `SingletonManager` tracks leadership changes automatically when singleton migrates between runners
