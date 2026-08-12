#!/usr/bin/env bash
# codegraph-worktree-mcp.sh <worktree> — provision a git worktree's codegraph
# MCP entry. Worktrunk post-start integration: the shared omp-container
# mcp.json entry (socat -> /tmp/codegraph.sock) only works INSIDE the omp
# container, which mounts the right instance socket per CWD. A host-side agent
# running in the worktree (Claude Code / opencode reading .mcp.json from the
# project root) needs an entry pointed at the worktree instance's HOST socket.
#
# VENDORED from the omp-infra-bootstrap skill (scripts/codegraph-worktree-mcp.sh)
# 2026-08-12 — the repo owns its hook scripts; re-vendor from the skill when it
# changes, never hand-edit both.
#
# Steps (all idempotent):
#   1. install the codegraph instance for the worktree (deployed codegraph CLI —
#      quadlet, volume, registry, shared mcp.json entry)
#   2. merge-write <worktree>/.mcp.json: the codegraph entry with the host
#      socket path; existing entries in the file are preserved
#
# Instance name = sanitized CWD basename — the SAME derivation as codegraph-cli
# and the omp-container wrapper, so the socket matches what omp mounts.
set -u

WORKTREE="${1:-$(pwd)}"
[ -d "$WORKTREE" ] || { echo "codegraph-worktree-mcp: no such dir: $WORKTREE" >&2; exit 1; }

CG="$(command -v codegraph 2>/dev/null || true)"
if [ -z "$CG" ]; then
  # Fall back to the omp-infra standard install location.
  CG="$HOME/.local/bin/codegraph"
fi
if [ ! -x "$CG" ]; then
  echo "codegraph-worktree-mcp: codegraph CLI not found on PATH or at $CG — install omp-infra-bootstrap first" >&2
  exit 1
fi

echo "codegraph-worktree-mcp: ensuring instance for $WORKTREE"
# The codegraph CLI derives the instance from ITS cwd (folder="$(pwd)"), not
# from an argument — cd into the worktree so the instance matches the socket
# path below.
(cd "$WORKTREE" && "$CG") || { echo "codegraph-worktree-mcp: instance install failed" >&2; exit 1; }

instance="$(basename "$WORKTREE")"
instance="${instance//[^A-Za-z0-9_.-]/-}"
instance="${instance//--/-}"
instance="${instance#"${instance%%[!-_.]*}"}"
instance="${instance%"${instance##*[!-_.]}"}"
[ -n "$instance" ] || instance="root"

SOCKET="$HOME/.local/share/containers/storage/volumes/codegraph-${instance}-data/_data/codegraph.sock"

MCP_FILE="$WORKTREE/.mcp.json"
python3 - "$MCP_FILE" "$SOCKET" <<'PY'
import json, os, sys
path, socket = sys.argv[1], sys.argv[2]
cfg = {}
if os.path.exists(path):
    try:
        with open(path) as f:
            cfg = json.load(f)
    except Exception as e:
        print(f"codegraph-worktree-mcp: existing {path} unreadable ({e}); overwriting", file=sys.stderr)
        cfg = {}
cfg.setdefault("mcpServers", {})["codegraph"] = {
    "type": "stdio",
    "command": "socat",
    "args": ["STDIO", "UNIX-CONNECT:" + socket],
    "enabled": True,
}
with open(path, "w") as f:
    json.dump(cfg, f, indent=2)
    f.write("\n")
PY

echo "codegraph-worktree-mcp: $MCP_FILE -> $SOCKET"
