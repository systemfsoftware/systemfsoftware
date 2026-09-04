#!/usr/bin/env -S deno run --allow-read=CONSTITUTION.md --allow-run=git
/**
 * Validate the constitution corpus against constitution-rule/v1.
 *
 * Gate for CONST-E6 applied reflexively: the constitution's own format must fail a
 * command, not a cited clause. Validates every fenced ```yaml block against
 * hardcoded schema fields (required_fields, optional_fields, gate_values).
 *
 * Coverage is checked before schema. A rule the parser never reaches cannot be
 * validated, and an unterminated fence silently removes every rule after it from
 * the block — so counting ids in the raw text and comparing against ids parsed
 * out of blocks is the only way this gate can report on what it did NOT see.
 * Without that comparison a green run means "no rule I happened to parse was
 * malformed", which is not the claim the gate is making.
 *
 * The corpus is one file — the resident law, whole and always in context. Ids are
 * unique across it and citations resolve within it. A corpus path that is merely
 * absent is not the only shape of a vacuous pass: a file present and parsing but
 * declaring no rule scores identically to a healthy one, so the corpus path must
 * contribute at least one rule of its own.
 *
 * There is no backwards compatibility and no retirement ledger. A deleted rule
 * leaves its number vacant and a citation to it resolves to nothing, which is a
 * loud failure and needs no gate. Vacancy is named, not enforced: --against lists
 * ids vacated since the revision and corpus files absent at it on the success
 * line, because a green line that silently measured less is the vacuous pass this
 * gate exists to prevent. The one identifier defect that is NOT loud is an id that
 * survives while its rule changes underneath it: every citation keeps resolving,
 * to the wrong rule. No single revision can see that, so `--against <rev>`
 * recomputes it from git.
 *
 * Exit 0 clean, 1 with a named defect list, 3 unmeasurable — no identifiers matched
 * at all, reported distinctly because an id pattern that matches nothing scores a
 * healthy corpus and an id-free one identically.
 */
import { parse } from "@std/yaml";

const PATHS = ["CONSTITUTION.md"] as const;

const ID_RE = /^CONST-[A-Z]\d+$/;
const ID_IN_TEXT_RE = /^\s*- id:\s*(\S+)\s*$/gm;
const TITLE_IN_TEXT_RE = /^\s*- id:\s*(\S+)\s*\n\s*title:\s*(.+?)\s*$/gm;
const CITE_RE = /\bCONST-[A-Z]\d+\b/g;

// A family letter names what a rule is ABOUT, never where it sits. Adding a
// letter here is half the change; the other half is the registry in AGENTS.md.
const FAMILIES: Record<string, string> = {
  "G": "Governance",
  "E": "Enforcement",
  "P": "Purity",
  "D": "Domain modelling",
  "B": "Boundary",
  "T": "Testing",
  "N": "Naming & structure",
  "W": "Work discipline",
  "S": "Subtraction",
};

const REQUIRED_FIELDS = ["id", "title", "gate", "do", "dont", "harm", "check"];
const OPTIONAL_FIELDS = ["scope", "example", "layers"];
const GATE_VALUES: Record<string, true> = {
  "lint": true,
  "type-checker": true,
  "mutation": true,
  "review": true,
};
const KNOWN_FAMILIES = Object.keys(FAMILIES).sort().join(", ");
const KNOWN_GATES = Object.keys(GATE_VALUES).sort().join(", ");

type Rule = Record<string, unknown>;

function fail(errors: string[]): never {
  for (const e of errors) console.log(`FAIL ${e}`);
  Deno.exit(1);
}

function titlesFrom(text: string): Map<string, string> {
  const titles = new Map<string, string>();
  for (const m of text.matchAll(TITLE_IN_TEXT_RE)) titles.set(m[1], m[2]);
  return titles;
}

const againstIndex = Deno.args.indexOf("--against");
const againstEquals = Deno.args.find((a) => a.startsWith("--against="));
const against = againstIndex >= 0
  ? Deno.args[againstIndex + 1]
  : againstEquals?.slice("--against=".length);
const againstRequested = against !== undefined || againstIndex >= 0 ||
  againstEquals !== undefined;
if (againstRequested && (against === undefined || against.length === 0)) {
  fail(["--against requires a revision (form: --against <rev> or --against=<rev>)"]);
}
const strayAgainst = Deno.args.find((a) =>
  a.startsWith("--against") && a !== "--against" && !a.startsWith("--against=")
);
if (strayAgainst !== undefined) {
  fail([`unknown flag '${strayAgainst}' — did you mean --against <rev>?`]);
}

const errors: string[] = [];

const texts: Record<string, string> = {};
for (const p of PATHS) {
  try {
    texts[p] = await Deno.readTextFile(p);
  } catch {
    fail([`${p}: missing`]);
  }
}

const blocks: Array<{ path: string; index: number; body: string }> = [];
for (const [p, t] of Object.entries(texts)) {
  const found = [...t.matchAll(/```yaml\n([\s\S]*?)```/g)];
  if (found.length === 0) {
    errors.push(`${p}: no fenced yaml rule blocks found`);
  }
  found.forEach((m, j) => blocks.push({ path: p, index: j, body: m[1] }));
}
if (blocks.length === 0) {
  fail([...errors, "no fenced yaml rule blocks found in any corpus file"]);
}

const rules: Rule[] = [];
for (const b of blocks) {
  try {
    const doc = parse(b.body) as { rules?: Rule[] } | null;
    rules.push(...(doc?.rules ?? []));
  } catch (e) {
    errors.push(
      `${b.path} block ${b.index}: YAML parse error: ${(e as Error).message}`,
    );
  }
}

const parsedIds = rules.map((r) => String(r.id));
const declaredIds = Object.values(texts).flatMap((t) =>
  [...t.matchAll(ID_IN_TEXT_RE)].map((m) => m[1])
);
const parsedIdSet = new Set(parsedIds);
const uncovered = declaredIds.filter((i) => !parsedIdSet.has(i));
if (uncovered.length > 0) {
  errors.push(
    `${uncovered.length} rule(s) declared in the corpus but never parsed into a yaml block: [${uncovered.join(", ")}] — check for an unterminated \`\`\`yaml fence`,
  );
}

if (declaredIds.length === 0) {
  console.log(
    "UNMEASURABLE: no rule identifiers matched — the corpus is empty, or the id syntax moved",
  );
  Deno.exit(3);
}

const seen = new Set<string>();
for (const r of rules) {
  const rid = String(r.id ?? "<no id>");
  for (const f of REQUIRED_FIELDS) {
    if (!(f in r)) errors.push(`${rid}: missing required field '${f}'`);
  }
  const unknown = Object.keys(r).filter((k) =>
    !REQUIRED_FIELDS.includes(k) && !OPTIONAL_FIELDS.includes(k)
  );
  if (unknown.length > 0) {
    errors.push(`${rid}: unknown fields [${unknown.sort().join(", ")}]`);
  }
  if (!ID_RE.test(rid)) {
    errors.push(`${rid}: id does not match ${ID_RE.source}`);
  } else if (!Object.hasOwn(FAMILIES, rid["CONST-".length])) {
    errors.push(
      `${rid}: family '${rid["CONST-".length]}' is not registered — known families are [${KNOWN_FAMILIES}]`,
    );
  }
  if (seen.has(rid)) errors.push(`${rid}: duplicate id`);
  seen.add(rid);
  if (typeof r.gate !== "string" || !Object.hasOwn(GATE_VALUES, r.gate)) {
    errors.push(`${rid}: gate '${String(r.gate)}' not in [${KNOWN_GATES}]`);
  }
  for (const f of ["do", "dont"] as const) {
    const v = r[f];
    const shaped = typeof v === "string" ||
      (Array.isArray(v) && v.every((x) => typeof x === "string"));
    if (!shaped) errors.push(`${rid}: '${f}' must be a string or list of strings`);
  }
  const ex = r.example;
  if (ex !== undefined && ex !== null) {
    const shaped = typeof ex === "object" && !Array.isArray(ex) &&
      Object.values(ex).every((v) => typeof v === "string");
    if (!shaped) errors.push(`${rid}: 'example' must be a map of strings`);
  }
}

const cites: Record<string, Set<string>> = {};
for (const [p, t] of Object.entries(texts)) {
  cites[p] = new Set([...t.matchAll(CITE_RE)].map((m) => m[0]));
}
const allCited = new Set<string>();
for (const s of Object.values(cites)) {
  for (const c of s) allCited.add(c);
}
for (const cited of [...allCited].sort()) {
  if (seen.has(cited)) continue;
  for (const p of PATHS) {
    if (cites[p]?.has(cited)) {
      errors.push(`dangling citation: '${cited}' is cited in ${p} but names no rule`);
    }
  }
}

async function checkAgainst(
  rev: string,
  errors: string[],
  liveTitles: Map<string, string>,
): Promise<{ vacated: string[]; uncompared: string[] }> {
  const oldTitles = new Map<string, string>();
  const uncompared: string[] = [];
  try {
    const results = await Promise.all(PATHS.map(async (p) => {
      const cmd = new Deno.Command("git", {
        args: ["show", `${rev}:${p}`],
        stdout: "piped",
        stderr: "piped",
      });
      const out = await cmd.output();
      if (!out.success) return { p, absent: true, titles: [] };
      return { p, absent: false, titles: [...titlesFrom(new TextDecoder().decode(out.stdout))] };
    }));
    for (const r of results) {
      if (r.absent) {
        uncompared.push(r.p);
        continue;
      }
      for (const [rid, title] of r.titles) oldTitles.set(rid, title);
    }
  } catch (e) {
    errors.push(`--against ${rev}: git is not runnable (${(e as Error).message})`);
    return { vacated: [], uncompared: [] };
  }

  if (oldTitles.size === 0) {
    errors.push(
      `--against ${rev}: no rules found in any corpus file at that revision — wrong rev, or every file was renamed`,
    );
    return { vacated: [], uncompared: [] };
  }

  for (const [rid, oldTitle] of oldTitles) {
    const live = liveTitles.get(rid);
    if (live !== undefined && live !== oldTitle) {
      errors.push(
        `reassigned id: '${rid}' named "${oldTitle}" at ${rev} and names "${live}" now — every citation to it resolves to a different rule`,
      );
    }
  }

  const vacated = [...oldTitles.keys()].filter((rid) => !liveTitles.has(rid))
    .sort();
  return { vacated, uncompared: uncompared.sort() };
}

let vacated: string[] = [];
let uncompared: string[] = [];
if (against !== undefined) {
  const liveTitles = new Map<string, string>();
  for (const t of Object.values(texts)) {
    for (const [rid, title] of titlesFrom(t)) liveTitles.set(rid, title);
  }
  ({ vacated, uncompared } = await checkAgainst(against, errors, liveTitles));
}

if (errors.length > 0) fail(errors);

const suffix = against !== undefined ? `; no id reassigned since ${against}` : "";
console.log(
  `valid: ${rules.length} rules across ${blocks.length} yaml blocks in ${Object.keys(texts).length} files, ${Object.keys(FAMILIES).length} families${suffix}`,
);
if (against !== undefined && uncompared.length > 0) {
  console.log(`  not compared, absent at ${against}: ${uncompared.join(", ")}`);
}
if (against !== undefined && vacated.length > 0) {
  console.log(`  ${vacated.length} id(s) vacated since ${against}: ${vacated.join(", ")}`);
}
