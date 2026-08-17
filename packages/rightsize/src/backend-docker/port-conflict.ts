/**
 * Port-bind-conflict classification — the pure classifier the launch
 * workflow's retry loop keys on (behavioral reference: upstream
 * rightsize-node `src/backend-docker/port-conflict.ts` at the fork point,
 * Apache-2.0).
 *
 * The daemon has no distinct exception type for a host-port bind conflict —
 * only free text in a 500 response body, such as "driver failed programming
 * external connectivity: ... address already in use" or "Bind for
 * 0.0.0.0:6379 failed: port is already allocated". Classify by message,
 * case-insensitively; anything else is a terminal launch failure.
 *
 * Pure: message text in, verdict out. Nothing here touches a socket.
 *
 * @since 0.1.0
 */

/** Whether the daemon's failure text describes a host-port bind conflict. */
export const isPortBindConflictMessage = (message: string): boolean => {
  const m = message.toLowerCase()
  return m.includes('already in use') || m.includes('already allocated')
}
