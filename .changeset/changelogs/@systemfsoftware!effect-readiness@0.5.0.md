## 0.5.0

### Minor Changes

- `Responded`, and the `HttpEvidence` and `ProbeEvidence` unions that carry it, now encode as `{ _tag: 'Responded', statusCode }` instead of decoding a raw HTTP status line. Evidence encoded by an earlier version, which carries `statusLine`, no longer decodes; re-encode it with the status code.
