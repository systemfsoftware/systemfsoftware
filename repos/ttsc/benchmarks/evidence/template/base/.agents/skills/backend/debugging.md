# Debugging

Assign a failure to its owner before editing.

## Capture

Keep the exact command, diagnostic, stack, request and response when applicable, and current diff. Preserve large logs in a file and inspect focused sections. Run one mutating generator or test at a time.

## Ownership

| Symptom | First owner to inspect |
| --- | --- |
| Prisma generation fails | schema |
| DTO/provider assignment fails | contract, selection, or mapping |
| expected route returns 404 | controller metadata and discovery |
| SDK accessor is missing | controller contract and SDK regeneration |
| business behavior fails | provider |
| test depends on global state | test setup and shared SQLite assumptions |
| frontend import is missing | API package entry exports |
| many failures follow generated-file replacement | wait for the writer and next watcher rebuild |

Do not patch generated files, weaken tests, silence diagnostics, or add subject-specific branches.

## Verify

After fixing the owner:

1. reproduce the original command successfully;
2. run the narrowest adjacent check that detects the same cause; and
3. rerun downstream behavior when the repair crossed a layer.

A fix is complete when the root cause is corrected and no cast, ignore, weakened assertion, or generated-file edit hides the failure.
