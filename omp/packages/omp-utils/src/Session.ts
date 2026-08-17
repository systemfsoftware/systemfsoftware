/**
 * Kernel: construct session identifiers for OMP hook dispatch.
 *
 * OMP hooks receive a session_id and agent_id pair;
 * the bridge sets agent_id to null (no subagent concept in OMP).
 */
export interface SessionIds {
  readonly session_id: string
  readonly agent_id: null
}

export function sessionIds(getSessionId: () => string): SessionIds {
  return {
    session_id: getSessionId(),
    agent_id: null,
  }
}
