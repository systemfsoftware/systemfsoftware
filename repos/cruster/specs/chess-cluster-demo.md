# Chess Cluster Demo

A distributed chess server demonstrating all features of `cruster`.

## Goals

1. **Feature Coverage**: Exercise every cluster capability in a realistic application
2. **Production Patterns**: Show best practices for entity design, error handling, persistence
3. **Usability**: Playable via CLI, HTTP API, and WebSocket for live updates
4. **Testability**: Comprehensive tests using `TestCluster`

## Feature Coverage Matrix

| Cluster Feature | Chess Implementation |
|-----------------|---------------------|
| Stateless Entity | `MatchmakingService` - pairs players into games |
| Stateful Entity (in-memory) | `PlayerSession` - tracks connected player, current game |
| Persisted State | `ChessGame` - board state survives crashes |
| Workflows (durable) | `ChessGame::make_move` - move with validation, persisted |
| Entity Traits | `Auditable` - shared audit logging across entities |
| RPC (request/response) | Get game state, validate move, get rankings |
| Notify (fire-and-forget) | Broadcast move to opponent's session |
| Streaming | `ChessGame::watch` - live game event stream |
| Scheduled Messages | Move timeout - auto-forfeit after configurable delay |
| Singletons | `Leaderboard` - single instance for global rankings |
| Multi-entity Interaction | Game notifies PlayerSessions, updates Leaderboard |
| Entity Lifecycle | Games spawn on create, reap after completion + TTL |
| Crash Recovery | Game resumes mid-match after node restart |
| Multi-runner | Demonstrate sharding across 2+ nodes |

## Architecture

```
                                 ┌─────────────────────────────────────┐
                                 │           HTTP/WS API               │
                                 │  (axum + tower)                     │
                                 └──────────────┬──────────────────────┘
                                                │
                    ┌───────────────────────────┼───────────────────────────┐
                    │                           │                           │
                    ▼                           ▼                           ▼
         ┌──────────────────┐       ┌──────────────────┐       ┌──────────────────┐
         │  PlayerSession   │       │   ChessGame      │       │   Leaderboard    │
         │  (in-memory)     │◄─────►│   (persisted)    │──────►│   (singleton)    │
         └──────────────────┘       └──────────────────┘       └──────────────────┘
                    │                         │
                    │                         │ traits(Auditable)
                    ▼                         ▼
         ┌──────────────────┐       ┌──────────────────┐
         │  Matchmaking     │       │   Auditable      │
         │  (stateless)     │       │   (trait)        │
         └──────────────────┘       └──────────────────┘
```

## Entities

### 1. PlayerSession (In-Memory State)

Tracks a player's active connection and current game.

**State**: player_id, username, current_game_id, status (Online/InGame/Idle/InQueue), connected_at, last_activity

**RPCs**:
- `connect(username)` - Initialize session
- `join_matchmaking_queue()` - Enter queue, returns position
- `leave_queue()` - Exit queue
- `get_status()` - Return current state
- `resign_game()` - Resign current game
- `notify_game_event(event)` - Called by ChessGame to push events
- `notify_match_found(game_id, color)` - Called by Matchmaking when paired

### 2. ChessGame (Persisted State + Workflows)

The core game entity with durable move execution. Uses `Auditable` trait.

**State**: game_id, white_player, black_player, board_fen, moves (list of MoveRecord), status (InProgress/WhiteWins/BlackWins/Draw/Aborted), result_reason, time_control, white_time_remaining, black_time_remaining, last_move_at, created_at, draw_offer

**MoveRecord**: move_number, color, san (e.g. "Nf3"), uci (e.g. "g1f3"), fen_after, timestamp, time_taken

**Workflows** (durable, at-least-once):
- `make_move(player, uci_move)` - Validate turn, validate legality via shakmaty, apply move, check game end, update clocks, notify opponent, update leaderboard if over, schedule timeout
- `offer_draw(player)` - Record draw offer
- `accept_draw(player)` - Accept if offer exists, end game
- `resign(player)` - End game with resignation

**RPCs**:
- `get_state()` - Return full game state
- `get_legal_moves(player)` - Return legal moves for current position
- `get_move_history()` - Return move list
- `watch()` - Streaming: live game event stream
- `handle_timeout()` - Called by scheduled message, forfeit on time

### 3. MatchmakingService (Stateless)

Pairs players into games. Stateless - queue state rebuilt from PlayerSession queries or maintained ephemerally.

**RPCs**:
- `find_match(player_id, preferences)` - Query waiting players, find opponent by rating/preferences, create ChessGame entity, notify both PlayerSessions
- `cancel_search(player_id)` - Remove from queue
- `get_queue_status()` - Return queue statistics

### 4. Leaderboard (Singleton, Persisted)

Global rankings - exactly one instance across the cluster.

**State**: ratings (map of PlayerId to PlayerRating), top_players (cached top 100), total_games_played, last_updated

**PlayerRating**: elo, wins, losses, draws, peak_elo

**Workflows**:
- `record_game_result(result)` - Calculate ELO changes, update both players, refresh top_players cache

**RPCs**:
- `get_player_rating(player_id)` - Return player's rating
- `get_top_players(limit)` - Return top N players
- `get_rankings_around(player_id, range)` - Return players around given player's rank

### 5. Auditable Trait

Shared audit logging capability, composed into entities that need audit trails.

**State**: entries (bounded deque of AuditEntry), max_entries

**AuditEntry**: timestamp, action, actor, details (JSON)

**Private Methods**:
- `log_audit(action, actor, details)` - Append entry, trim if over max

**RPCs**:
- `get_audit_log(limit)` - Return recent audit entries

## API Layer

### HTTP Endpoints (axum)

```
POST   /api/v1/players                    # Register/connect player
GET    /api/v1/players/:id                # Get player info
POST   /api/v1/players/:id/queue          # Join matchmaking
DELETE /api/v1/players/:id/queue          # Leave matchmaking

POST   /api/v1/games                      # Create private game (invite)
GET    /api/v1/games/:id                  # Get game state
POST   /api/v1/games/:id/moves            # Make a move
POST   /api/v1/games/:id/draw/offer       # Offer draw
POST   /api/v1/games/:id/draw/accept      # Accept draw
POST   /api/v1/games/:id/resign           # Resign

GET    /api/v1/leaderboard                # Get top players
GET    /api/v1/leaderboard/:player_id     # Get player ranking

GET    /health                            # Health check
GET    /metrics                           # Prometheus metrics
```

### WebSocket (for live updates)

```
WS /api/v1/games/:id/watch   # Stream game events
WS /api/v1/players/:id/events # Stream player events (match found, game updates)
```

## CLI

```bash
# Player management
chess-cluster player register <username>
chess-cluster player status <player_id>

# Matchmaking
chess-cluster match find <player_id> [--time-control 5+3]
chess-cluster match cancel <player_id>

# Game play
chess-cluster game show <game_id>
chess-cluster game moves <game_id>
chess-cluster game move <game_id> <player_id> <uci_move>  # e.g., e2e4
chess-cluster game resign <game_id> <player_id>
chess-cluster game draw offer <game_id> <player_id>
chess-cluster game draw accept <game_id> <player_id>

# Leaderboard
chess-cluster leaderboard top [--limit 10]
chess-cluster leaderboard player <player_id>

# Admin
chess-cluster admin stats
chess-cluster admin games active
```

## Project Structure

```
examples/chess-cluster/
├── Cargo.toml
├── README.md
├── docker-compose.yml          # Postgres + optional etcd for multi-runner
├── migrations/                 # SQL migrations (managed by sqlx)
│   └── 001_initial.sql
├── src/
│   ├── main.rs                 # Binary entry point
│   ├── lib.rs                  # Library root
│   ├── config.rs               # Configuration (env vars, CLI args)
│   ├── entities/
│   │   ├── mod.rs
│   │   ├── player_session.rs
│   │   ├── chess_game.rs
│   │   ├── matchmaking.rs
│   │   ├── leaderboard.rs
│   │   └── traits/
│   │       ├── mod.rs
│   │       └── auditable.rs
│   ├── types/
│   │   ├── mod.rs
│   │   ├── game.rs             # GameId, GameStatus, MoveRecord, etc.
│   │   ├── player.rs           # PlayerId, PlayerStatus, etc.
│   │   └── chess.rs            # Wrapper types around shakmaty
│   ├── api/
│   │   ├── mod.rs
│   │   ├── http.rs             # axum routes
│   │   ├── websocket.rs        # WebSocket handlers
│   │   └── error.rs            # API error types
│   ├── cli/
│   │   ├── mod.rs
│   │   └── commands.rs         # clap command definitions
│   └── chess/
│       ├── mod.rs
│       └── engine.rs           # shakmaty integration, move validation
├── tests/
│   ├── common/mod.rs           # Test utilities
│   ├── game_lifecycle.rs       # Full game from start to checkmate
│   ├── matchmaking.rs          # Queue and pairing tests
│   ├── crash_recovery.rs       # Restart mid-game, verify resume
│   ├── timeouts.rs             # Move timeout forfeit
│   └── multi_runner.rs         # Sharding across nodes
└── examples/
    └── quick_game.rs           # Simple example of playing a game
```

## Dependencies

- `cruster` with `sql` feature
- `shakmaty` with `serde` feature for chess logic
- `axum` with `ws` feature for HTTP/WebSocket API
- `tower` and `tower-http` for middleware
- `tokio`, `futures` for async
- `serde`, `serde_json` for serialization
- `clap` for CLI
- `figment` for configuration
- `tracing`, `tracing-subscriber` for logging
- `chrono` for timestamps
- `sqlx` with postgres for cluster storage
- `proptest` for property-based testing

## Milestones

### M1: Core Entities (No API)
- [x] Project setup, Cargo.toml, workspace integration
- [x] Type definitions (PlayerId, GameId, etc.)
- [x] shakmaty integration wrapper
- [x] PlayerSession entity (in-memory state)
- [x] ChessGame entity (persisted state, workflows)
- [x] Basic tests with TestCluster

### M2: Full Entity Suite
- [x] MatchmakingService entity
- [x] Leaderboard singleton entity
- [x] Auditable trait
- [x] Scheduled message for move timeouts
- [x] Entity interaction tests

### M3: API Layer
- [ ] HTTP API (axum)
- [ ] WebSocket for game watching
- [ ] CLI tool
- [ ] docker-compose with Postgres

### M4: Production Hardening
- [ ] Crash recovery tests
- [ ] Multi-runner tests (with etcd)
- [ ] Metrics integration
- [ ] Documentation and README

## Design Decisions

1. **Rating system**: Standard ELO (simple, well-understood)
2. **Time controls**: All three - Bullet (1+0), Blitz (5+3), Rapid (15+10)
3. **Spectators**: Public by default - anyone can watch any game
4. **Game history**: Retain completed games for 30 days (configurable)
5. **Authentication**: No auth - trust player_id in requests (demo simplicity)

## Notes

- Use `shakmaty` for all chess logic - don't reinvent move validation
- FEN strings for board serialization (standard, debuggable)
- UCI notation for moves in API (e2e4 format, unambiguous)
- SAN notation for display (e4, Nf3 - human readable)

## Workflow Engine Support

The `cruster` crate provides `MemoryWorkflowEngine` and `MemoryWorkflowStorage` for testing entities with `#[workflow]` methods. Use `TestCluster::with_workflow_support()` to create a test cluster with full workflow support:

```rust
use cruster::testing::TestCluster;

// Create cluster with workflow support for testing #[workflow] methods
let cluster = TestCluster::with_workflow_support().await;

// Register entities that use #[workflow] methods
let client = cluster.register(ChessGame).await.unwrap();

// Test workflow methods like make_move, offer_draw, etc.
```

Available test cluster configurations:
- `TestCluster::new()` - basic in-memory cluster (no workflow support)
- `TestCluster::with_message_storage()` - adds message storage for at-least-once delivery
- `TestCluster::with_workflow_support()` - full workflow support (message storage + state storage + workflow engine)
- `TestCluster::with_workflow_support_and_engine(config, engine)` - custom workflow engine for advanced testing
