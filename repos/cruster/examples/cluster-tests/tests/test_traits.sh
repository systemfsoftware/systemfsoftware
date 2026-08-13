#!/bin/bash
set -e
source "$(dirname "$0")/lib/helpers.sh"

test_start "Entity Traits"

ID="trait-test-$(date +%s)"

# Update data (triggers audit and version bump)
post "/trait/$ID/update" "{\"data\": \"hello\"}" > /dev/null
test_pass "update with trait works"

# Get data
RESULT=$(get "/trait/$ID")
assert_eq "$RESULT" '"hello"'
test_pass "get returns data"

# Check audit log from trait
LOG=$(get "/trait/$ID/audit-log")
assert_contains "$LOG" "update"
test_pass "audit log populated by trait"

# Check version from trait
VERSION=$(get "/trait/$ID/version")
assert_eq "$VERSION" "1"
test_pass "version trait works"

# Multiple updates should increment version
post "/trait/$ID/update" "{\"data\": \"world\"}" > /dev/null
VERSION=$(get "/trait/$ID/version")
assert_eq "$VERSION" "2"
test_pass "version increments on update"

# Audit log should have multiple entries
LOG=$(get "/trait/$ID/audit-log")
# Count occurrences of "update" in log (should be 2)
UPDATE_COUNT=$(echo "$LOG" | grep -o '"action":"update"' | wc -l | tr -d ' ')
if [ "$UPDATE_COUNT" -lt 2 ]; then
    test_fail "expected at least 2 audit entries, got $UPDATE_COUNT"
fi
test_pass "audit log tracks all updates"

# Data should be updated
RESULT=$(get "/trait/$ID")
assert_eq "$RESULT" '"world"'
test_pass "data updated correctly"

# Different entity IDs should have independent state
ID2="trait-test-2-$(date +%s)"
post "/trait/$ID2/update" "{\"data\": \"independent\"}" > /dev/null
VERSION=$(get "/trait/$ID2/version")
assert_eq "$VERSION" "1"
test_pass "entity IDs are independent"

# Original entity should still have version 2
VERSION=$(get "/trait/$ID/version")
assert_eq "$VERSION" "2"
test_pass "original entity state preserved"

echo "All trait tests passed"
