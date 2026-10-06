---
"@systemfsoftware/effect-contract": minor
---

Add `McpServerOptions.extend` to the MCP surface. It registers raw `effect/ai` tools, resources, resource templates and prompts beside the tools projected from the contract. The extension may require `McpConfirmationKey`, and `layer` supplies the mount's `provide` layer (token verifier and confirmation key) to it, so a raw tool can sign and verify its own request state. Projected capability tools keep their contract names.

Remove `isAllowedOrigin` from `@systemfsoftware/effect-contract/mcp`. The MCP server never called it: `allowedOrigins` goes to Effect's `McpServer.layerHttp`, which refuses a request whose `Origin` header is present and not in that list with 403.

Resource subscriptions now work on a stateful MCP session served over HTTP from the session Durable Object. `resources/subscribe` and `resources/unsubscribe` used to answer `-32645 Resource subscriptions are not supported`.
