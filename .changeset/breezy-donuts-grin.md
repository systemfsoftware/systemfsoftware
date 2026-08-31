---
"@systemfsoftware/all": patch
---

Narrow @std ban to modules that overlap with Effect (fs → FileSystem, path → Path, encoding → Encoding, streams → Stream); other @std packages (crypto, dotenv, assert, testing, etc.) are now allowed
