#!/bin/bash
set -e
source "$(dirname "$0")/lib/helpers.sh"

test_start "Durable Workflows"

ID="wf-test"
EXEC_ID="exec-$(date +%s)"

# Run simple workflow
RESULT=$(post "/workflow/$ID/run-simple" "{\"exec_id\": \"$EXEC_ID\"}")
assert_contains "$RESULT" "completed"
test_pass "simple workflow completes"

# Check execution record
EXEC=$(get "/workflow/$ID/execution/$EXEC_ID")
assert_contains "$EXEC" "step1"
assert_contains "$EXEC" "step2"
assert_contains "$EXEC" "step3"
test_pass "all steps recorded"

# Run long workflow
LONG_ID="long-$(date +%s)"
RESULT=$(post "/workflow/$ID/run-long" "{\"exec_id\": \"$LONG_ID\", \"steps\": 10}")
EXEC=$(get "/workflow/$ID/execution/$LONG_ID")
# Verify we have 10 steps recorded (0-indexed: step0 through step9)
for i in $(seq 0 9); do
    assert_contains "$EXEC" "step$i"
done
test_pass "long workflow completes with all steps"

# List all executions - should include our test runs
EXECUTIONS=$(get "/workflow/$ID/executions")
assert_contains "$EXECUTIONS" "$EXEC_ID"
assert_contains "$EXECUTIONS" "$LONG_ID"
test_pass "list executions shows all runs"

# Different entity IDs have independent executions
ID2="wf-test-2"
EXEC_ID2="exec2-$(date +%s)"
post "/workflow/$ID2/run-simple" "{\"exec_id\": \"$EXEC_ID2\"}" > /dev/null

# First entity shouldn't have the second entity's execution
EXECUTIONS1=$(get "/workflow/$ID/executions")
EXECUTIONS2=$(get "/workflow/$ID2/executions")
if [[ "$EXECUTIONS1" == *"$EXEC_ID2"* ]]; then
    test_fail "entity IDs should have independent executions"
fi
assert_contains "$EXECUTIONS2" "$EXEC_ID2"
test_pass "entity IDs have independent executions"

echo "All workflow tests passed"
