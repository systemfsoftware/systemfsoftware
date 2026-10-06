---
"@systemfsoftware/effect-contract": minor
---

An MCP server mounted with `mount` or `sessionServe` can now advertise protocol extensions and serve the requests they own. Pass `extensions` to `McpServerOptions`: each entry advertises a capability under `capabilities.extensions` and offers a handler that claims the JSON-RPC requests it implements. A claimed request is framed by the surface — including `Mcp-Method`/`Mcp-Name` header validation on the stateless wire — and anything unclaimed still reaches the `effect/ai` runtime, so an extension only shadows what it implements. An extension may omit its capability when it adds protocol behaviour without advertising one.

The MCP endpoint now terminates sessions: a `DELETE` carrying an issued `Mcp-Session-Id` answers 204, and any later request that keeps sending that id is answered 404.
