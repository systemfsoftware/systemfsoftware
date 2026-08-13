#!/bin/bash
set -e
source "$(dirname "$0")/lib/helpers.sh"

test_start "Cross-Entity Communication"

ID1="cross-1-$(date +%s)"
ID2="cross-2-$(date +%s)"

# Clear any previous messages
post "/cross/$ID1/clear" "{}" > /dev/null
post "/cross/$ID2/clear" "{}" > /dev/null
test_pass "cleared previous messages"

# Send message from entity 1 to entity 2
post "/cross/$ID1/send" "{\"target_type\": \"CrossEntity\", \"target_id\": \"$ID2\", \"message\": \"hello from 1\"}" > /dev/null
test_pass "message sent from entity 1 to entity 2"

# Check entity 2 received it
MESSAGES=$(get "/cross/$ID2/messages")
assert_contains "$MESSAGES" "hello from 1"
assert_contains "$MESSAGES" "$ID1"
test_pass "entity 2 received message from entity 1"

# Verify entity 1 did NOT receive its own message
MESSAGES1=$(get "/cross/$ID1/messages")
if [[ "$MESSAGES1" == *"hello from 1"* ]]; then
    test_fail "entity 1 should not receive its own sent message"
fi
test_pass "entity 1 did not receive its own message"

# Send message in the other direction
post "/cross/$ID2/send" "{\"target_type\": \"CrossEntity\", \"target_id\": \"$ID1\", \"message\": \"reply from 2\"}" > /dev/null
test_pass "message sent from entity 2 to entity 1"

# Check entity 1 received it
MESSAGES1=$(get "/cross/$ID1/messages")
assert_contains "$MESSAGES1" "reply from 2"
assert_contains "$MESSAGES1" "$ID2"
test_pass "entity 1 received reply from entity 2"

# Test multiple messages to same entity
post "/cross/$ID1/send" "{\"target_type\": \"CrossEntity\", \"target_id\": \"$ID2\", \"message\": \"second message\"}" > /dev/null
post "/cross/$ID1/send" "{\"target_type\": \"CrossEntity\", \"target_id\": \"$ID2\", \"message\": \"third message\"}" > /dev/null
MESSAGES=$(get "/cross/$ID2/messages")
assert_contains "$MESSAGES" "hello from 1"
assert_contains "$MESSAGES" "second message"
assert_contains "$MESSAGES" "third message"
test_pass "multiple messages accumulated correctly"

# Test clear messages
post "/cross/$ID2/clear" "{}" > /dev/null
MESSAGES=$(get "/cross/$ID2/messages")
assert_eq "$MESSAGES" "[]"
test_pass "clear messages works"

# Test ping pong
ID3="cross-3-$(date +%s)"
ID4="cross-4-$(date +%s)"
RESULT=$(post "/cross/$ID3/ping-pong" "{\"partner_id\": \"$ID4\", \"count\": 5}")
# With count=5, we expect 10 total pings (5 rounds of A->B + B->A)
assert_eq "$RESULT" "10"
test_pass "ping pong completed with correct count"

# Test single ping pong round
ID5="cross-5-$(date +%s)"
ID6="cross-6-$(date +%s)"
RESULT=$(post "/cross/$ID5/ping-pong" "{\"partner_id\": \"$ID6\", \"count\": 1}")
assert_eq "$RESULT" "2"
test_pass "single ping pong round works"

# Different entity IDs are independent
ID7="cross-7-$(date +%s)"
post "/cross/$ID7/clear" "{}" > /dev/null
MESSAGES=$(get "/cross/$ID7/messages")
assert_eq "$MESSAGES" "[]"
post "/cross/$ID3/send" "{\"target_type\": \"CrossEntity\", \"target_id\": \"$ID4\", \"message\": \"new msg\"}" > /dev/null
MESSAGES7=$(get "/cross/$ID7/messages")
assert_eq "$MESSAGES7" "[]"
test_pass "entity IDs are independent"

# Test receive directly (bypassing send orchestration)
ID8="cross-8-$(date +%s)"
post "/cross/$ID8/clear" "{}" > /dev/null
post "/cross/$ID8/receive" "{\"from\": \"external-sender\", \"message\": \"direct receive\"}" > /dev/null
MESSAGES=$(get "/cross/$ID8/messages")
assert_contains "$MESSAGES" "direct receive"
assert_contains "$MESSAGES" "external-sender"
test_pass "direct receive works"

echo "All cross-entity tests passed"
