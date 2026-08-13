#!/bin/bash
set -e
source "$(dirname "$0")/lib/helpers.sh"

test_start "Singleton Entities"

# Reset state for clean testing
post "/singleton/reset" "{}" > /dev/null
test_pass "reset singleton state"

# Wait for singleton to start and tick at least once
# The singleton ticks every 1 second, so 3 seconds gives it time to initialize and tick
sleep 3

# Get tick count
TICK1=$(get "/singleton/tick-count")
if [ "$TICK1" -lt 1 ]; then
    test_fail "tick count should be >= 1, got: $TICK1"
fi
test_pass "singleton is ticking"

# Wait and check tick count increases
sleep 2
TICK2=$(get "/singleton/tick-count")
if [ "$TICK2" -le "$TICK1" ]; then
    test_fail "tick count should increase: was $TICK1, now $TICK2"
fi
test_pass "tick count increases over time"

# Check current runner is set
RUNNER=$(get "/singleton/current-runner")
# Remove quotes from JSON string
RUNNER=$(echo "$RUNNER" | tr -d '"')
if [ -z "$RUNNER" ]; then
    test_fail "no runner reported"
fi
test_pass "singleton has runner: $RUNNER"

# Get full state
STATE=$(get "/singleton/state")
if [ "$STATE" = "null" ]; then
    test_fail "singleton state is null"
fi
test_pass "singleton state available"

# Verify state contains expected fields
if ! echo "$STATE" | grep -q "runner_id"; then
    test_fail "state missing runner_id"
fi
if ! echo "$STATE" | grep -q "tick_count"; then
    test_fail "state missing tick_count"
fi
if ! echo "$STATE" | grep -q "last_tick_at"; then
    test_fail "state missing last_tick_at"
fi
if ! echo "$STATE" | grep -q "graceful_shutdown_at"; then
    test_fail "state missing graceful_shutdown_at"
fi
test_pass "singleton state has all fields"

# Verify graceful_shutdown_at is null while running
GRACEFUL_SHUTDOWN=$(echo "$STATE" | jq -r '.graceful_shutdown_at')
if [ "$GRACEFUL_SHUTDOWN" != "null" ]; then
    test_fail "graceful_shutdown_at should be null while running, got: $GRACEFUL_SHUTDOWN"
fi
test_pass "graceful_shutdown_at is null while singleton is running"

# Test reset
post "/singleton/reset" "{}" > /dev/null
sleep 2  # Wait for singleton to restart
TICK_AFTER_RESET=$(get "/singleton/tick-count")
# After reset, singleton restarts with tick_count=0, then ticks
if [ "$TICK_AFTER_RESET" -ge "$TICK2" ]; then
    test_fail "tick count should reset: was $TICK2, after reset $TICK_AFTER_RESET"
fi
test_pass "reset clears tick count"

echo "All singleton tests passed"
