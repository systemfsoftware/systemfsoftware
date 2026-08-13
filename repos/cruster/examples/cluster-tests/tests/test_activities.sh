#!/bin/bash
set -e
source "$(dirname "$0")/lib/helpers.sh"

test_start "Activity Journaling"

ID="activity-test"
EXEC_ID="exec-$(date +%s)"

# Run workflow with activities
RESULT=$(post "/activity/$ID/run" "{\"exec_id\": \"$EXEC_ID\"}")
# Result should be a list of activity action strings
assert_contains "$RESULT" "$EXEC_ID"
test_pass "workflow with activities completes"

# Check activity log
LOG=$(get "/activity/$ID/log")
assert_contains "$LOG" "$EXEC_ID"
# Activity log should contain the action from the workflow
assert_contains "$LOG" "action"
test_pass "activities logged"

# Run another workflow to verify multiple activities are tracked
EXEC_ID2="exec2-$(date +%s)"
post "/activity/$ID/run" "{\"exec_id\": \"$EXEC_ID2\"}" > /dev/null

# Both executions should appear in the log
LOG=$(get "/activity/$ID/log")
assert_contains "$LOG" "$EXEC_ID"
assert_contains "$LOG" "$EXEC_ID2"
test_pass "multiple activity runs are tracked"

# Different entity IDs have independent activity logs
ID2="activity-test-2"
EXEC_ID3="exec3-$(date +%s)"
post "/activity/$ID2/run" "{\"exec_id\": \"$EXEC_ID3\"}" > /dev/null

LOG1=$(get "/activity/$ID/log")
LOG2=$(get "/activity/$ID2/log")

# Second entity shouldn't have first entity's activities
if [[ "$LOG2" == *"$EXEC_ID"* ]]; then
    test_fail "entity IDs should have independent activity logs"
fi
assert_contains "$LOG2" "$EXEC_ID3"
test_pass "entity IDs have independent activity logs"

echo "All activity tests passed"
