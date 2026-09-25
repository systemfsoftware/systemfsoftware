#!/bin/sh
set -eu

cd "$(dirname "$0")/../.."

cargo fmt --check
cargo clippy --workspace --all-targets -- -D warnings

if grep -rnE '^[[:space:]]*(for|while|loop)[[:space:](]' crates/gritlint_core/src/decide.rs; then
    echo "a decide module contains an imperative loop; use iterator combinators" >&2
    exit 1
fi

cargo test --workspace
cargo run -q -p gritlint -- test packs

cargo run -q -p gritlint -- schema > npm/gritlint/configuration_schema.json
git diff --exit-code -- npm/gritlint/configuration_schema.json

if cargo tree -e features --workspace --prefix none |
    grep -qE 'marzano-(core|util) feature "(ai_builtins|embeddings|external_functions|grit_tracing|network_requests)"'; then
    echo "a network-bearing engine feature is enabled" >&2
    exit 1
fi

cargo deny check
