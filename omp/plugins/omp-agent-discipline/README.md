# @systemfsoftware/omp-agent-discipline

Mechanical harness discipline for Oh My Pi agents.

Enforces execution constraints and dispatch doctrine at the tool call boundary rather than relying on LLM compliance with prose system prompts.

## Features

- **Dispatch Doctrine Enforcement:** Blocks prohibited tool calls and invalid delegation before execution.
- **XD Device Retry Guard:** Prevents agents from endlessly looping on broken dynamic device tool calls.
- **Lazy Runtime Initialization:** Defers heavy Effect runtimes to avoid penalizing initial CLI startup latency.

## Installation

Add the extension to your Oh My Pi configuration:

```json
{
  "plugins": [
    "@systemfsoftware/omp-agent-discipline"
  ]
}
```

Or install manually via package manager:

```bash
pnpm add @systemfsoftware/omp-agent-discipline
```

## How It Works

1. **Pre-flight Tool Validation:** Intercepts `emitToolCall` events across registered sessions.
2. **Short-Circuit Rejection:** If an agent attempts an unauthorized tool invocation or invalid pattern, the extension immediately cancels the action and injects remediation guidance back to the model.
3. **Session Lifecycle Hooking:** Warms required background resources on `session_start` without blocking extension registration.

## API Reference

The exported TypeScript definitions are published with the package: [`etc/omp-agent-discipline.api.md`](./etc/omp-agent-discipline.api.md).

## License

Apache-2.0
