#!/bin/bash
set -e
source "$(dirname "$0")/lib/helpers.sh"

test_start "State Persistence"

# Create unique ID for this test run
ID="persist-$(date +%s)"

# Set initial value
post "/counter/$ID/increment" "42" > /dev/null
RESULT=$(get "/counter/$ID")
assert_eq "$RESULT" "42"
test_pass "initial value set"

echo "Waiting for entity eviction (idle timeout)..."
sleep 7  # max_idle_time_secs = 5, plus buffer for reaper interval

# Value should persist after eviction
RESULT=$(get "/counter/$ID")
assert_eq "$RESULT" "42"
test_pass "value persists after eviction"

echo "All persistence tests passed"
