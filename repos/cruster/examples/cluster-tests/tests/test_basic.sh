#!/bin/bash
set -e
source "$(dirname "$0")/lib/helpers.sh"

test_start "Basic Counter Operations"

# Use unique ID per test run to avoid state pollution
TEST_ID="basic-$(date +%s)"

# Increment
RESULT=$(post "/counter/$TEST_ID/increment" "5")
assert_eq "$RESULT" "5"
test_pass "increment returns new value"

# Get
RESULT=$(get "/counter/$TEST_ID")
assert_eq "$RESULT" "5"
test_pass "get returns current value"

# Multiple increments
post "/counter/$TEST_ID/increment" "3" > /dev/null
RESULT=$(get "/counter/$TEST_ID")
assert_eq "$RESULT" "8"
test_pass "multiple increments accumulate"

# Decrement
RESULT=$(post "/counter/$TEST_ID/decrement" "2")
assert_eq "$RESULT" "6"
test_pass "decrement works"

# Reset
post "/counter/$TEST_ID/reset" "{}" > /dev/null
RESULT=$(get "/counter/$TEST_ID")
assert_eq "$RESULT" "0"
test_pass "reset works"

# Different entity IDs are independent
TEST_ID2="basic2-$(date +%s)"
post "/counter/$TEST_ID2/increment" "100" > /dev/null
RESULT=$(get "/counter/$TEST_ID")
assert_eq "$RESULT" "0"
RESULT=$(get "/counter/$TEST_ID2")
assert_eq "$RESULT" "100"
test_pass "entity IDs are independent"

echo "All basic tests passed"
