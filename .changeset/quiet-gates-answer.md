---
"@systemfsoftware/effect-e2e": minor
---

Add the `@systemfsoftware/effect-e2e/model` entry: the `ModelGateway` service, the provider-neutral `ModelRequest`/`ModelResponse` vocabulary, and `OpenAiCompatible.layer({ model, apiKey })`, which calls OpenRouter or any OpenAI-compatible `/chat/completions` endpoint over an `HttpClient` the caller provides. Provider replies fail only as `MODEL_PROVIDER_FAILED`, `MODEL_REFUSED`, `MODEL_OUTPUT_INVALID` or `CONTEXT_OVERFLOW`, and the API key is sent only in the `Authorization` header. The model config gains an optional `maxInputTokens` budget; a request estimated over it fails as `CONTEXT_OVERFLOW` before anything is sent.
