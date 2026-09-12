/**
 * Hand-written html documents the parser feature parses. Every range, offset
 * and format asserted beside them is derived from these literals by hand — the
 * documents are the oracle's other side, never the parser's output.
 */

/** Two inline scripts: one javascript, one declared typescript by `type`. */
export const INLINE_SCRIPTS_HTML = `<!doctype html>
<html>
  <body>
    <script>const answer = 42</script>
    <script type="text/typescript">const label: string = 'ok'</script>
  </body>
</html>
`

/** A single script that loads an external file: it has no body to instrument. */
export const EXTERNAL_SCRIPT_HTML = '<script src="./bundle.js"></script>\n'

/** A mismatched closing tag: the html parser reports an error for it. */
export const MALFORMED_HTML = `<!doctype html>
<html>
  <body>
    <div></span>
  </body>
</html>
`
