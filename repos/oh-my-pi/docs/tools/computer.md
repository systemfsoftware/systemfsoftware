# computer

> Capture and control the real host desktop through native OS APIs. This is not the `browser` tool and does not use Chromium, CDP, Puppeteer, DOM, or ARIA surfaces.

User setup, safety guidance, platform permissions, and verified limitations: [Native computer use](../computer-use.md).

## Source

- Entry: `packages/coding-agent/src/tools/computer.ts`
- Model-facing prompt: `packages/coding-agent/src/prompts/tools/computer.md`
- Safety prompt: `packages/coding-agent/src/prompts/system/computer-safety.md`
- Tool registration/gate: `packages/coding-agent/src/tools/index.ts`
- Approval wrapper: `packages/coding-agent/src/extensibility/extensions/wrapper.ts`
- Renderer: `packages/coding-agent/src/tools/computer-renderer.ts`
- Supervisor/protocol: `packages/coding-agent/src/tools/computer/{supervisor,protocol,worker,worker-entry}.ts`
- Native implementation: `crates/pi-natives/src/desktop.rs`
- Native loader: `packages/natives/native/loader-state.js`
- Provider types: `packages/ai/src/types.ts`
- OpenAI GA schemas: `packages/ai/src/providers/openai-responses-server-schema.ts`
- OpenAI conversion/replay: `packages/ai/src/providers/openai-shared.ts`, `openai-responses.ts`, `openai-codex-responses.ts`, `azure-openai-responses.ts`

## Availability and declaration

- `computer.enabled` gates registration and defaults to `false`. The `/computer` slash command toggles it for the current session without persisting settings.
- Enabled tool load mode: `essential`.
- Concurrency: `exclusive`.
- Native descriptor: `{ type: "computer" }`.
- Providers serialize the native descriptor only when `model.supportsComputerUse === true`; every other function-calling model receives `computer` as a regular function tool with the typed action schema below.
- Automatic capability derivation covers GA `gpt-5.4+` IDs on OpenAI Responses, OpenAI Codex Responses, and Azure OpenAI Responses; explicit model metadata overrides derivation.
- When OpenAI Responses-family history is replayed to a model without native support, native call/output items become stable assistant text notes. Other provider adapters serialize the generic call/result in their ordinary tool format.

Unlike `browser`, `computer` operates the entire visible host session. It can act in IDEs, terminals, native applications, browser windows, and system dialogs, but has no structured application/DOM inspection.

## Settings

| Setting | Type | Default | Contract |
|---|---|---:|---|
| `computer.enabled` | boolean | `false` | Register tool. |
| `computer.backend` | `auto \| native` | `auto` | Both prohibit non-native fallback. |
| `computer.display` | string | `all` | `all` or numeric native monitor ID. |
| `computer.maxWidth` | number | `1920` | Maximum composite PNG width; must be positive. |
| `computer.maxHeight` | number | `1200` | Maximum composite PNG height; must be positive. |

Constructor snapshots these settings into one `DesktopSessionOptions`. No setting is reread per call.

## Inputs

Public schema (arktype; also serialized as the function-tool JSON schema):

```ts
{
  actions?: Array<{
    type: "click" | "double_click" | "drag" | "keypress" | "move" | "screenshot" | "scroll" | "type" | "wait",
    x?: int32 >= 0, y?: int32 >= 0,          // most-recent-screenshot pixels
    button?: "left" | "right" | "wheel" | "back" | "forward",
    path?: Array<{ x, y }>,                   // drag waypoints
    keys?: string[],                          // keypress chord / held pointer modifiers
    scroll_x?: int32, scroll_y?: int32,
    text?: string
  }>
}
```

Provider-native `computer_call` metadata stays authoritative: `execute()` chooses `context.toolCall.providerMetadata.actions` when metadata type is `computer`; otherwise it uses `params.actions`. Both paths run the same exact per-type validator. An omitted or empty `actions` array degrades to a screenshot-only batch; a non-array, unexpected field, or invalid entry fails before worker dispatch.

### GA action shapes

| Type | Shape |
|---|---|
| `click` | `{ type, button: "left" \| "right" \| "wheel" \| "back" \| "forward", x, y, keys? }` |
| `double_click` | `{ type, x, y, keys?: string[] \| null }` |
| `drag` | `{ type, path: Array<{x,y}>, keys? }`; minimum two points |
| `keypress` | `{ type, keys: string[] }`; non-empty array and entries |
| `move` | `{ type, x, y, keys? }` |
| `screenshot` | `{ type }` |
| `scroll` | `{ type, x, y, scroll_x, scroll_y, keys? }` |
| `type` | `{ type, text: string }` |
| `wait` | `{ type }`; fixed two-second sleep |

Validation rejects missing, unexpected, and action-inapplicable fields before emitting input, at both the JS ingress and native layer. Coordinates, drag points, and scroll deltas must be integers in signed 32-bit range (coordinates additionally non-negative); out-of-range JS numbers fail closed instead of truncating in the N-API `i32` conversion. Mouse `keys` accept unique modifier keys only. Keypress strings are case-insensitive, accept aliases and `+`-separated chords, and fall back to one Unicode character. `wheel` is the GA middle-button spelling; `middle` is invalid.

Scroll conversion: nonzero provider delta `d` becomes `sign(d) × max(1, floor((abs(d)+50)/100))` native steps.

## Approval

`computerApproval(args)` returns:

- `read`: every action is `screenshot` or `wait`;
- `exec`: any input action, missing actions, or malformed action.

Approval prompts render up to 12 ordered action summaries, truncate each line to 240 characters, and cap the combined details at 2,000 characters.

Provider safety checks come from native call metadata, not parameters. Wrapper precedence:

1. Resolve ordinary mode and `tools.approval.computer` policy.
2. Explicit `deny` blocks immediately.
3. Pending provider checks force interactive approval regardless of `yolo`, `autoApprove`, per-tool `allow`, or xdev approval.
4. No UI fails closed with `Tool "computer" has pending provider safety checks but no interactive UI is available.`
5. Approval sets `context.providerSafetyApproved = true`.
6. Tool execution checks the marker again.
7. Successful output echoes pending checks as acknowledged checks.

The agent's system safety prompt independently treats all UI as untrusted and requires point-of-risk confirmation for consequential actions. Provider approval does not replace direct user authorization.

## Outputs

One successful call returns:

- `content`: one `{ type: "image", mimeType: "image/png", detail: "original", data: <base64> }` block;
- `details.width` / `height`: composite PNG dimensions;
- `details.backend`: `quartz`, `x11`, `wayland`, or `win32`;
- `details.displayServer`: OS display endpoint/subsystem label when known;
- `details.capturePermission` / `inputPermission`: `granted`, `denied`, `unknown`, or `unavailable`;
- `details.displays`: selected display geometry in global logical and screenshot-pixel spaces;
- `details.capabilities`: current native backend/capture/input status;
- `details.actions`: executed action type names;

For a provider-native call, the result also includes:

- `providerMetadata.type`: `computer`;
- `providerMetadata.screenshot`: inline `computer_screenshot.image_url` data URI;
- `providerMetadata.acknowledgedSafetyChecks`: exact approved provider checks.

Regular function calls omit this native metadata so every provider serializes the PNG through its ordinary image-tool-result path.

The renderer merges call and result. Expanded output shows every display; collapsed output shows at most three. Each row includes native ID/name, logical rectangle, PNG pixel rectangle, scale, and primary flag.

OMP native execution never creates a provider Files upload. The provider contract also accepts `{ type: "computer_screenshot", file_id }`; gateway/history parsing preserves that reference in metadata, and capable-model replay emits it unchanged.

## Flow

1. Tool registration checks `computer.enabled`.
2. `ComputerTool` constructs a `ComputerSupervisor` with session settings but does not start a worker.
3. Provider adapter exposes the native declaration only for capable models.
4. Provider `action`/`actions` and pending safety checks become typed tool-call metadata.
5. Extension wrapper resolves tool approval and mandatory provider safety approval.
6. `ComputerTool.execute()` chooses metadata actions, validates the batch, and rechecks safety approval.
7. Supervisor serializes execution behind a promise tail and lazily starts one Bun worker.
8. Worker constructs one native `DesktopSession` and reports capabilities.
9. Worker rejects coordinate input until it has returned a screenshot to the provider.
10. Native session validates all actions, executes them in order, defers any `screenshot` markers, and captures one fresh PNG after the entire successful batch.
11. Worker transfers the PNG buffer to the parent and preserves session/frame state for the next call.
12. Tool returns image content, display/capability details, and exact GA result metadata.

## Capture and coordinate mapping

Native capture enumerates selected monitors, sorts by logical `y/x/id`, coalesces mirrored rectangles, and rejects duplicate IDs, invalid scale/size, and overlapping non-mirrored layouts. Monitor images are captured at native pixels.

The compositor builds the global logical bounding rectangle, then selects one render scale limited by native density and configured width/height. Display gaps remain opaque black. Maximum allocation: 268,435,456 composite pixels.

Every `DesktopDisplay` carries:

```ts
{
  id, name,
  x, y, width, height, scale,       // global logical space
  pixelX, pixelY, pixelWidth, pixelHeight, // returned PNG space
  isPrimary
}
```

Coordinate mapping finds the containing PNG display rectangle, scales locally to logical width/height, then adds global origin. Quartz and Win32 accept negative global origins; Linux input rejects them before emitting events. Negative screenshot points, image bounds, and layout-gap points fail closed.

Before each coordinate action, native code re-enumerates displays and compares ID, logical rectangle, and scale against the stored frame. Difference clears the stored frame and returns `DESKTOP_LAYOUT_CHANGED`; caller must capture again.

Every coordinate action in a batch maps through the same frame returned by the prior successful call. A `screenshot` marker emits no input and creates no intermediate result, so it does not rebase later coordinates in that batch. After the UI changes, finish the call and use its final returned PNG for coordinates in the next call.

## Platform variants

| Target | Native surface |
|---|---|
| `darwin-x64`, `darwin-arm64` | Bounded macOS `screencapture` service capture, Quartz `CGEvent` pointer events, native input. Screen Recording preflight; Accessibility required operationally. |
| `linux-x64`, `linux-arm64` (glibc and musl) | Pure-Rust X11 backend bundled in the core addon: `x11rb` RustConnection capture (RandR monitors, `GetImage`) and XTest input with keysym mapping. No GUI system libraries linked; the X protocol is spoken over the display socket. |
| `win32-x64` | xcap capture, native input, `SendInput` absolute movement over the virtual desktop. |
| Other targets | Native package loader rejects unsupported platform tag. |

Wayland detection wins when `XDG_SESSION_TYPE=wayland` or `WAYLAND_DISPLAY` is set. Capture and input still require `DISPLAY` (XWayland): capture reads the X11 composite and input is emitted as XTest events in the same X11 global space, bridged to native windows by compositors with XWayland input support. No D-Bus, portal, or libei connection is made, and no permission prompt is opened. Coordinate input rejects negative global display origins, and XTest limits global coordinates to `0..=32767` on each axis.

macOS capture calls `CGPreflightScreenCaptureAccess()` without prompting. Input creation also disables automatic permission prompts. Windows sets DPI awareness and maps pointer coordinates with `MOUSEEVENTF_VIRTUALDESK`, supporting negative origins and secondary displays.

## Worker and session lifecycle

`ComputerSupervisor`:

- start timeout: 10 seconds;
- close timeout: 1.5 seconds;
- serializes calls even after an earlier call rejects;
- on abort, terminates worker and rejects pending requests;
- owner registry supports bulk close on session/eval-owner teardown.

`ComputerWorkerCore` also serializes inbound messages. It initializes once, tracks whether a screenshot was returned, closes native session once, then unsubscribes and closes transport.

Native `DesktopSession` starts a named `omp-desktop-session` thread. Capture/execute/close requests use a FIFO channel. Every execute batch carries a 60-second deadline enforced inside the native worker: the deadline is checked before each action and the final capture, expiry returns `DESKTOP_DEADLINE_EXCEEDED` without emitting further input, and wait-heavy batches that cannot finish in time are rejected upfront. Explicit close waits up to two seconds and is idempotent. Destructor sends best-effort close but does not block indefinitely on a stuck worker.

## Side effects

- Captures every selected visible display into model/provider context.
- Emits real user-session keyboard and pointer events.
- Keeps a native worker and desktop session alive across calls.
- May expose visible secrets, notifications, other applications, and system dialogs in screenshots.
- Does not launch a browser, upload to provider Files, persist screenshots as local files, or create arbitrary child processes beyond its dedicated Bun/native workers.

## Errors

Stable native codes:

- `DESKTOP_INVALID_OPTIONS`
- `DESKTOP_INVALID_ACTION`
- `DESKTOP_BACKEND_UNAVAILABLE`
- `DESKTOP_PERMISSION_DENIED`
- `DESKTOP_CAPTURE_FAILED`
- `DESKTOP_INPUT_FAILED`
- `DESKTOP_LAYOUT_CHANGED`
- `DESKTOP_COORDINATE_OUT_OF_BOUNDS`
- `DESKTOP_DEADLINE_EXCEEDED`
- `DESKTOP_SESSION_CLOSED`
- `DESKTOP_WORKER_FAILED`

Tool/wrapper errors also include:

- `Computer call requires an array of actions`
- `Computer call contains an invalid action`
- `Computer session is closed`
- `Provider safety checks require interactive approval before computer input`
- `Timed out starting native computer worker`
- `Tool "computer" has pending provider safety checks but no interactive UI is available.`

Key platform failures and remedies are listed in [Native computer use: Troubleshooting](../computer-use.md#troubleshooting).

## Limits and proof boundary

- No non-native backend or browser fallback.
- No pure Wayland capture; XWayland required. On Wayland, XTest input delivery to native windows depends on the compositor's XWayland input bridge.
- Linux coordinate input rejects negative global display origins; X11/XTest also rejects global positions above 32767.
- Windows backend implemented but not remotely exercised for this feature.
- Real remote macOS proof used `ComputerSupervisor` → worker → native session on a real macOS host, controlling TextEdit with global hotkey, double-click, click, type, and 1920×1080 Quartz capture after permissions were granted.
- That proof did not include a live OpenAI native provider round trip. GA transport and replay are contract-tested locally. The pure-Rust Linux backend is exercised by unit tests (pixel conversion, keysym mapping, deadline enforcement), not by a live X session in CI.
