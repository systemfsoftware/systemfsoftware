#!/bin/bash
# Singleton failover test - tests graceful shutdown when a node is killed
set -e
source "$(dirname "$0")/lib/helpers.sh"

test_start "Singleton Failover (Graceful Shutdown)"

if [ -z "$DOCKER_COMPOSE_PROJECT" ]; then
    echo "SKIP: DOCKER_COMPOSE_PROJECT not set"
    exit 0
fi

# Helper to query a specific node directly
query_node() {
    local node=$1
    local path=$2
    docker compose -p "$DOCKER_COMPOSE_PROJECT" exec -T "$node" curl -sf "http://localhost:8080$path" 2>/dev/null
}

# Get initial state
STATE=$(get "/singleton/state")
INITIAL_RUNNER=$(echo "$STATE" | jq -r '.runner_id')
NODE_TO_KILL=$(echo "$INITIAL_RUNNER" | cut -d: -f1)

# Determine a surviving node to query
if [ "$NODE_TO_KILL" = "node1" ]; then
    SURVIVING_NODE="node2"
else
    SURVIVING_NODE="node1"
fi

test_pass "singleton on $INITIAL_RUNNER, will query $SURVIVING_NODE after kill"

# Kill the node
docker compose -p "$DOCKER_COMPOSE_PROJECT" stop "$NODE_TO_KILL" > /dev/null 2>&1
test_pass "stopped $NODE_TO_KILL"

# Check graceful shutdown marker via surviving node
STATE=$(query_node "$SURVIVING_NODE" "/singleton/state")
GRACEFUL_SHUTDOWN=$(echo "$STATE" | jq -r '.graceful_shutdown_at')
if [ "$GRACEFUL_SHUTDOWN" = "null" ]; then
    test_fail "graceful_shutdown_at not set"
fi
test_pass "graceful shutdown marker set"

# Wait for reallocation
sleep 5

# Verify new singleton via surviving node
STATE=$(query_node "$SURVIVING_NODE" "/singleton/state")
NEW_RUNNER=$(echo "$STATE" | jq -r '.runner_id')
GRACEFUL_SHUTDOWN=$(echo "$STATE" | jq -r '.graceful_shutdown_at')

if [ "$NEW_RUNNER" = "$INITIAL_RUNNER" ]; then
    test_fail "singleton not reallocated"
fi
if [ "$GRACEFUL_SHUTDOWN" != "null" ]; then
    test_fail "graceful_shutdown_at not cleared"
fi
test_pass "singleton reallocated to $NEW_RUNNER"

# Restart node
docker compose -p "$DOCKER_COMPOSE_PROJECT" start "$NODE_TO_KILL" > /dev/null 2>&1
test_pass "restarted $NODE_TO_KILL"

echo "All singleton failover tests passed"
