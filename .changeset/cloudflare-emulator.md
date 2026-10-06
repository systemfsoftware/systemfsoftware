---
"@systemfsoftware/alchemy-cloudflare": minor
"@systemfsoftware/cloudflare-emulator": minor
---

Add `@systemfsoftware/cloudflare-emulator`, an offline, stateful Cloudflare API emulator that serves the `@systemfsoftware/alchemy-cloudflare` contract, so resources can be created, read, updated and deleted with no network. Run it with `cloudflare-emulator serve --port <n|0> --request-log <path>`: it prints one `{"ready":true,"port":N}` line once it listens, writes one `{method, path, status}` JSON line per API call with the query string removed, and exits 0 on SIGTERM. The `alchemy-cloudflare` contract also gains the Workers script routes (upload, settings, per-script and account `workers.dev` subdomain, list and delete), and a Worker upload accepts a `metadata` part plus one file part per module, named by filename.
