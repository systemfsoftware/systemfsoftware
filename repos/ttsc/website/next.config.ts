import nextra from "nextra";

// KaTeX renders the coverage composition on the evidence benchmark page. The
// figure published there is only checkable if the fold is legible as the
// arithmetic it is, rather than as a code block imitating one.
const withNextra = nextra({ latex: true });

export default withNextra({
  // `next dev` otherwise writes its own `AGENTS.md` and `CLAUDE.md` into this
  // directory on every start. `AGENTS.md` at the repository root is the single
  // entry point both Claude Code and Codex CLI read, and a generated pair here
  // becomes what they read for the site's own directory.
  agentRules: false,
  output: "export",
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  turbopack: {
    resolveAlias: {
      // Nextra's Turbopack default points this specifier at Next's internal
      // `@vercel/turbopack-next/mdx-import-source`, which does not resolve under
      // Next 16, so `nextra/mdx-remote` fails to build. Next 15 never hit it
      // because `next build` ran webpack, where Nextra aliases the same
      // specifier to the project's own `mdx-components` file. Name that file
      // directly; Nextra spreads a caller's `resolveAlias` over its own default
      // for this case.
      "next-mdx-import-source-file": "./mdx-components.jsx",
    },
  },
});
