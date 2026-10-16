#!/usr/bin/env -S deno run --allow-read=CONSTITUTION.md,ENFORCEMENT.md --allow-run=git
/**
 * Validate the constitution corpus against the two-file corpus contract.
 *
 * The enforcement doctrine applied reflexively (ENFORCEMENT.md): the gate must
 * fail a command, not a cited clause. This script validates the corpus the law
 * lives in — CONSTITUTION.md (the law text) and ENFORCEMENT.md (doctrine plus the
 * `## Corpus` block that binds every live law to a handle, checks, incidents and
 * a mechanism). It certifies the shape the law is written in; it never grades
 * what the law says.
 *
 * Coverage is checked before schema. An id the parser never reaches cannot be
 * validated, and an unterminated fence silently removes every id after it from
 * the block — so counting ids in the raw text and comparing against ids parsed
 * out of blocks is the only way this gate reports on what it did NOT see. Without
 * that comparison a green run means "no id I happened to parse was malformed",
 * which is not the claim the gate is making.
 *
 * A corpus path that is merely absent is not the only shape of a vacuous pass: a
 * file present and parsing but declaring nothing scores identically to a healthy
 * one. A missing or unparseable file, or a missing `## Corpus` block, is
 * unmeasurable and exits 3 — never 0. Otherwise a named defect list exits 1, and
 * a clean corpus exits 0.
 *
 * Ids are not born in one document. A citation to an id must resolve to a live
 * law, a judging rule, or an absorbed id; a retired id is deliberately not a
 * valid citation, because a rule that moved keeps its number cold. `--against
 * <rev>` recomputes the lineage from git: every id at the revision must be live,
 * absorbed, or retired now, and where the revision named handles, a live id whose
 * handle moved is a reassignment (every citation to the number now points at a
 * different obligation) — the one identifier defect no single revision can see.
 */
import { parse } from "@std/yaml";

const CONSTITUTION = "CONSTITUTION.md";
const ENFORCEMENT = "ENFORCEMENT.md";
const PATHS = [CONSTITUTION, ENFORCEMENT] as const;

const LAW_ID_RE = /^CONST-[A-Z]\d+$/;
const HANDLE_RE = /^[A-Z][A-Z0-9]*(-[A-Z0-9]+)*$/;
const CITE_RE = /\bCONST-[A-Z]\d+\b/g;
const RAW_LAW_ID_RE = /^\s*-\s*id:\s*["']?CONST-[A-Z]\d+["']?\s*$/;
const RAW_CORPUS_ID_RE = /^\s*-\s*(?:law|id):\s*["']?CONST-[A-Z]\d+["']?\s*$/;

const MAX_WORDS = 1800;
const LADDER = ["type", "command", "refusal", "review"];
const SEVERITY = "P0";

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

const LAW_KEYS = ["id", "law", "why", "example"];
const EXAMPLE_KEYS = ["wrong", "right"];
const CHECK_KEYS = ["question", "criteria"];
const ENTRY_KEYS = [
  "law",
  "handle",
  "absorbs",
  "checks",
  "mechanism",
  "severity",
  "waiver",
  "incidents",
];
const JUDGING_KEYS = ["id", "handle", "rule"];
const RETIRED_KEYS = ["id", "reason"];

const KNOWN_FAMILIES = Object.keys(FAMILIES).sort().join(", ");
const KNOWN_LADDER = LADDER.join(", ");

const OLD_IDS: Record<string, true> = {
  "CONST-B1": true,
  "CONST-B2": true,
  "CONST-B3": true,
  "CONST-B4": true,
  "CONST-B5": true,
  "CONST-B6": true,
  "CONST-D1": true,
  "CONST-D2": true,
  "CONST-D3": true,
  "CONST-D4": true,
  "CONST-E7": true,
  "CONST-E9": true,
  "CONST-G3": true,
  "CONST-G4": true,
  "CONST-G5": true,
  "CONST-N1": true,
  "CONST-N2": true,
  "CONST-N3": true,
  "CONST-P1": true,
  "CONST-P2": true,
  "CONST-P3": true,
  "CONST-S1": true,
  "CONST-S2": true,
  "CONST-S3": true,
  "CONST-S4": true,
  "CONST-T3": true,
  "CONST-T8": true,
  "CONST-T9": true,
  "CONST-T10": true,
  "CONST-T12": true,
  "CONST-T13": true,
  "CONST-T14": true,
  "CONST-T15": true,
  "CONST-W1": true,
  "CONST-W2": true,
  "CONST-W3": true,
};

type LineRange = { first: number; count: number };
type YamlBlock = {
  path: string;
  index: number;
  body: string;
  closed: boolean;
  bodyRange: LineRange;
};
type Map_ = Record<string, unknown>;

function fail(errors: string[]): never {
  for (const e of errors) console.log(`FAIL ${e}`);
  Deno.exit(1);
}

function unmeasurable(message: string): never {
  console.error(`UNMEASURABLE: ${message}`);
  Deno.exit(3);
}

function asMap(v: unknown): Map_ | null {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? v as Map_
    : null;
}

function describe(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "a sequence";
  if (typeof v === "object") return "a mapping";
  return `a ${typeof v}`;
}

function extractBlocks(path: string, text: string): YamlBlock[] {
  const lines = text.split("\n");
  const blocks: YamlBlock[] = [];
  let i = 0;
  let index = 0;
  while (i < lines.length) {
    if (/^```yaml\s*$/.test(lines[i])) {
      const start = i;
      i++;
      const bodyLines: string[] = [];
      let closed = false;
      while (i < lines.length) {
        if (/^```\s*$/.test(lines[i])) {
          closed = true;
          break;
        }
        bodyLines.push(lines[i]);
        i++;
      }
      blocks.push({
        path,
        index: index++,
        body: bodyLines.join("\n"),
        closed,
        bodyRange: { first: start + 1, count: bodyLines.length },
      });
      if (closed) i++;
    } else {
      i++;
    }
  }
  return blocks;
}

function countRaw(text: string, re: RegExp): number {
  let n = 0;
  for (const line of text.split("\n")) if (re.test(line)) n++;
  return n;
}

function words(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function familyOf(id: string): string {
  return id["CONST-".length];
}

const DEF_LINE_RES: RegExp[] = [
  /^\s*-\s*id:\s*["']?CONST-[A-Z]\d+/,
  /^\s*-\s*law:\s*["']?CONST-[A-Z]\d+/,
  /^\s*-\s*["']?CONST-[A-Z]\d+["']?\s*$/,
  /^\s*absorbs:\s*\[/,
];

function isDefinitionLine(line: string): boolean {
  return DEF_LINE_RES.some((r) => r.test(line));
}

type ParsedBlock = { first: number; count: number; declared: Set<string> };

const parsedBlocks = new Map<string, ParsedBlock[]>();

function isDeclaredDefinition(path: string, lineNumber: number, line: string): boolean {
  if (!isDefinitionLine(line)) return false;
  const block = parsedBlocks.get(path)?.find(
    (b) => lineNumber >= b.first && lineNumber < b.first + b.count,
  );
  if (block === undefined) return false;
  return [...line.matchAll(CITE_RE)].every((m) => block.declared.has(m[0]));
}

function markParsedLines(path: string, range: LineRange, declared: Set<string>): void {
  let blocks = parsedBlocks.get(path);
  if (blocks === undefined) {
    blocks = [];
    parsedBlocks.set(path, blocks);
  }
  blocks.push({ first: range.first, count: range.count, declared });
}

const againstIndex = Deno.args.indexOf("--against");
const againstEquals = Deno.args.find((a) => a.startsWith("--against="));
const against = againstIndex >= 0
  ? Deno.args[againstIndex + 1]
  : againstEquals?.slice("--against=".length);
const againstRequested = againstIndex >= 0 || againstEquals !== undefined;
if (againstRequested && (against === undefined || against.length === 0)) {
  fail(["--against requires a revision (form: --against <rev> or --against=<rev>)"]);
}
const strayAgainst = Deno.args.find((a) =>
  a.startsWith("--against") && a !== "--against" && !a.startsWith("--against=")
);
if (strayAgainst !== undefined) {
  fail([`unknown flag '${strayAgainst}' — did you mean --against <rev>?`]);
}

const texts: Record<string, string> = {};
for (const p of PATHS) {
  try {
    texts[p] = await Deno.readTextFile(p);
  } catch {
    unmeasurable(`${p}: missing or unreadable`);
  }
}
const constText = texts[CONSTITUTION];
const enfText = texts[ENFORCEMENT];

const errors: string[] = [];

/** The required-key and unknown-key check, shared by its six call sites. */
function checkKeys(label: string, map: Map_, keys: readonly string[], infix = ""): void {
  for (const k of keys) {
    if (!(k in map)) errors.push(`${label}: ${infix}missing key '${k}'`);
  }
  const unknown = Object.keys(map).filter((k) => !keys.includes(k));
  if (unknown.length > 0) {
    errors.push(`${label}: ${infix}unknown key(s) [${unknown.sort().join(", ")}]`);
  }
}

const lawBlocks = extractBlocks(CONSTITUTION, constText);
const laws: Map_[] = [];
for (const b of lawBlocks) {
  if (!b.closed) {
    errors.push(
      `${b.path}: unterminated \`\`\`yaml fence in block ${b.index} — every id after it is unmeasured`,
    );
  }
  let doc: unknown;
  try {
    doc = parse(b.body);
  } catch (e) {
    errors.push(`${b.path} block ${b.index}: YAML parse error: ${(e as Error).message}`);
    continue;
  }
  if (!Array.isArray(doc)) {
    errors.push(
      `${b.path} block ${b.index}: expected a top-level sequence of laws, got ${describe(doc)}`,
    );
    continue;
  }
  const declared = new Set<string>();
  for (const item of doc) {
    laws.push(item as Map_);
    const id = asMap(item)?.id;
    if (typeof id === "string") declared.add(id);
  }
  markParsedLines(b.path, b.bodyRange, declared);
}

const constWords = words(constText);
if (constWords > MAX_WORDS) {
  errors.push(
    `${CONSTITUTION}: ${constWords} words exceeds the ${MAX_WORDS}-word budget`,
  );
}

const liveLawIds = new Set<string>();
const lawEntryCount = new Map<string, number>();

for (let i = 0; i < laws.length; i++) {
  const item = laws[i];
  const map = asMap(item);
  if (map === null) {
    errors.push(`law #${i + 1}: not a mapping`);
    continue;
  }
  const rawId = map.id;
  const id = typeof rawId === "string" ? rawId : `<law #${i + 1}>`;

  checkKeys(id, map, LAW_KEYS);

  for (const k of ["id", "law", "why"] as const) {
    if (k in map && typeof map[k] !== "string") {
      errors.push(`${id}: '${k}' must be a string`);
    }
  }

  if ("example" in map) {
    const ex = asMap(map.example);
    if (ex === null) {
      errors.push(`${id}: 'example' must be a mapping with 'wrong' and 'right'`);
    } else {
      checkKeys(id, ex, EXAMPLE_KEYS, "example ");
      for (const k of EXAMPLE_KEYS) {
        if (k in ex && typeof ex[k] !== "string") {
          errors.push(`${id}: example.'${k}' must be a string`);
        }
      }
    }
  }

  if (typeof rawId === "string") {
    if (!LAW_ID_RE.test(rawId)) {
      errors.push(`${rawId}: id does not match ${LAW_ID_RE.source}`);
    } else if (!Object.hasOwn(FAMILIES, familyOf(rawId))) {
      errors.push(
        `${rawId}: family '${familyOf(rawId)}' is not registered — known families are [${KNOWN_FAMILIES}]`,
      );
    }
    if (liveLawIds.has(rawId)) errors.push(`${rawId}: duplicate id`);
    liveLawIds.add(rawId);
  }
}

const rawLawIds = countRaw(constText, RAW_LAW_ID_RE);
if (rawLawIds > laws.length) {
  errors.push(
    `${CONSTITUTION}: ${rawLawIds} law id(s) declared in the raw text but only ${laws.length} parsed into yaml blocks — unterminated fence or a dropped block`,
  );
}

const structuralErrorCount = errors.length;

function findCorpusHeading(text: string): number {
  const lines = text.split("\n");
  let idx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^## Corpus\s*$/.test(lines[i])) idx = i;
  }
  return idx;
}

type CorpusRead = {
  /** Everything after the `## Corpus` heading, or null when the heading is absent. */
  text: string | null;
  /** Whether the first fenced block parsed into a mapping. */
  hasMap: boolean;
  blockRange: LineRange | null;
  entries: Map_[];
  judging: Map_[];
  retired: Map_[];
  /** Structural complaints; the live pass reports them, the at-rev pass tolerates them. */
  problems: string[];
};

/** One reader for both passes: the live corpus, and the corpus at `--against <rev>`. */
function readCorpus(text: string): CorpusRead {
  const headingLine = findCorpusHeading(text);
  const found = headingLine < 0 ? null : text.split("\n").slice(headingLine + 1).join("\n");
  const read: CorpusRead = {
    text: found,
    hasMap: false,
    blockRange: null,
    entries: [],
    judging: [],
    retired: [],
    problems: [],
  };
  if (found === null) return read;
  const blocks = extractBlocks(ENFORCEMENT, found);
  if (blocks.length === 0) {
    read.problems.push(`${ENFORCEMENT}: ## Corpus is not followed by a fenced yaml block`);
    return read;
  }
  if (blocks.length > 1) {
    read.problems.push(
      `${ENFORCEMENT}: ## Corpus must hold exactly one fenced yaml block, found ${blocks.length}`,
    );
  }
  const first = blocks[0];
  if (!first.closed) {
    read.problems.push(`${ENFORCEMENT}: unterminated \`\`\`yaml fence in the ## Corpus block`);
  }
  let doc: unknown;
  try {
    doc = parse(first.body);
  } catch (e) {
    read.problems.push(`${ENFORCEMENT}: ## Corpus YAML parse error: ${(e as Error).message}`);
    doc = undefined;
  }
  const map = asMap(doc);
  if (doc !== undefined && map === null) {
    read.problems.push(`${ENFORCEMENT}: ## Corpus must be a mapping, got ${describe(doc)}`);
  }
  if (map === null) return read;
  read.hasMap = true;
  read.blockRange = {
    first: headingLine + 1 + first.bodyRange.first,
    count: first.bodyRange.count,
  };
  const rawLaws = map.laws;
  const rawJudging = map.judging;
  const rawRetired = map.retired;
  if (rawLaws !== undefined && !Array.isArray(rawLaws)) {
    read.problems.push(`${ENFORCEMENT}: corpus 'laws' must be a sequence`);
  }
  if (rawJudging !== undefined && !Array.isArray(rawJudging)) {
    read.problems.push(`${ENFORCEMENT}: corpus 'judging' must be a sequence`);
  }
  if (rawRetired !== undefined && !Array.isArray(rawRetired)) {
    read.problems.push(`${ENFORCEMENT}: corpus 'retired' must be a sequence`);
  }
  if (Array.isArray(rawLaws)) for (const e of rawLaws) read.entries.push(e as Map_);
  if (Array.isArray(rawJudging)) for (const e of rawJudging) read.judging.push(e as Map_);
  if (Array.isArray(rawRetired)) for (const e of rawRetired) read.retired.push(e as Map_);
  return read;
}

function declaredCorpusIds(read: CorpusRead): Set<string> {
  const declared = new Set<string>();
  for (const e of read.entries) {
    const em = asMap(e);
    if (em === null) continue;
    if (typeof em.law === "string") declared.add(em.law);
    if (Array.isArray(em.absorbs)) {
      for (const a of em.absorbs) if (typeof a === "string") declared.add(a);
    }
  }
  for (const e of [...read.judging, ...read.retired]) {
    const em = asMap(e);
    if (em !== null && typeof em.id === "string") declared.add(em.id);
  }
  return declared;
}

const live = readCorpus(enfText);
if (live.blockRange !== null) {
  markParsedLines(ENFORCEMENT, live.blockRange, declaredCorpusIds(live));
}
const corpusText = live.text;
const corpusMissing = corpusText === null;
const rawCorpusIds = corpusText === null ? 0 : countRaw(corpusText, RAW_CORPUS_ID_RE);
errors.push(...live.problems);

type Corpus = {
  entries: Map_[];
  judging: Map_[];
  retired: Map_[];
  absorbedIds: string[];
  retiredIds: string[];
};
const corpus: Corpus = {
  entries: live.entries,
  judging: live.judging,
  retired: live.retired,
  absorbedIds: [],
  retiredIds: [],
};

async function lineageIds(): Promise<Set<string>> {
  const ids = new Set<string>();
  const commits = new Set<string>();
  for (const rev of against === undefined ? ["HEAD"] : ["HEAD", against]) {
    for (const commit of await commitsTouchingCorpus(rev)) commits.add(commit);
  }
  if (commits.size > 0) {
    const refs: string[] = [];
    for (const commit of commits) for (const p of PATHS) refs.push(`${commit}:./${p}`);
    const blobs = await gitCatFileBatch(refs);
    for (const commit of commits) {
      const lawText = blobs.get(`${commit}:./${CONSTITUTION}`);
      const declaredHere = new Set<string>(
        lawText !== undefined && lawText !== null
          ? idsFromConstitutionAtRev(lawText)
          : [],
      );
      for (const id of declaredHere) ids.add(id);
      const doctrine = blobs.get(`${commit}:./${ENFORCEMENT}`);
      if (doctrine !== undefined && doctrine !== null) {
        const at = readCorpus(doctrine);
        if (at.hasMap) {
          for (const e of at.entries) {
            const em = asMap(e);
            if (em !== null && typeof em.law === "string" && declaredHere.has(em.law)) {
              ids.add(em.law);
            }
          }
          for (const e of at.judging) {
            const em = asMap(e);
            if (em !== null && typeof em.id === "string") ids.add(em.id);
          }
        }
      }
    }
  }
  return ids;
}

async function commitsTouchingCorpus(rev: string): Promise<string[]> {
  try {
    const out = await new Deno.Command("git", {
      args: ["log", "--format=%H", rev, "--", `./${CONSTITUTION}`, `./${ENFORCEMENT}`],
      cwd: Deno.cwd(),
      clearEnv: true,
      stdout: "piped",
      stderr: "piped",
    }).output();
    if (!out.success) return [];
    return new TextDecoder().decode(out.stdout).split("\n").map((l) => l.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

async function gitCatFileBatch(objects: string[]): Promise<Map<string, string | null>> {
  const blobs = new Map<string, string | null>();
  if (objects.length === 0) return blobs;
  try {
    const child = new Deno.Command("git", {
      args: ["cat-file", "--batch"],
      cwd: Deno.cwd(),
      clearEnv: true,
      stdin: "piped",
      stdout: "piped",
      stderr: "piped",
    }).spawn();
    const writer = child.stdin.getWriter();
    const writing = (async () => {
      await writer.write(new TextEncoder().encode(objects.map((o) => `${o}\n`).join("")));
      await writer.close();
    })().catch(() => {});
    const out = await child.output();
    await writing;
    const bytes = out.stdout;
    const decoder = new TextDecoder();
    let at = 0;
    for (const object of objects) {
      const newline = bytes.indexOf(0x0a, at);
      if (newline < 0) break;
      const header = decoder.decode(bytes.subarray(at, newline));
      at = newline + 1;
      if (header.endsWith(" missing")) {
        blobs.set(object, null);
        continue;
      }
      const parts = header.split(" ");
      const size = Number(parts[parts.length - 1]);
      if (parts.length !== 3 || !Number.isInteger(size) || size < 0 || at + size > bytes.length) {
        break;
      }
      blobs.set(object, parts[1] === "blob" ? decoder.decode(bytes.subarray(at, at + size)) : null);
      at += size + 1;
    }
  } catch {
    return blobs;
  }
  return blobs;
}

let constAtRev: string | null = null;
let enfAtRev: string | null = null;
if (against !== undefined) {
  try {
    [constAtRev, enfAtRev] = await Promise.all([
      gitShow(against, CONSTITUTION),
      gitShow(against, ENFORCEMENT),
    ]);
  } catch (e) {
    errors.push(`--against ${against}: git is not runnable (${(e as Error).message})`);
  }
}

const knownOldIds = new Set<string>(Object.keys(OLD_IDS));
for (const id of await lineageIds()) knownOldIds.add(id);

const handleOwner = new Map<string, string>();
const handleById = new Map<string, string>();
function registerHandle(id: string, rawHandle: unknown): void {
  if (typeof rawHandle !== "string") {
    errors.push(`${id}: 'handle' must be a string`);
    return;
  }
  if (!HANDLE_RE.test(rawHandle)) {
    errors.push(`${id}: handle '${rawHandle}' is not UPPER-KEBAB`);
  }
  if (handleOwner.has(rawHandle)) {
    errors.push(`handle '${rawHandle}' is not unique (used by ${handleOwner.get(rawHandle)} and ${id})`);
  } else {
    handleOwner.set(rawHandle, id);
  }
  handleById.set(id, rawHandle);
}

for (let i = 0; i < corpus.entries.length; i++) {
  const map = asMap(corpus.entries[i]);
  if (map === null) {
    errors.push(`corpus entry #${i + 1}: not a mapping`);
    continue;
  }
  const rawLaw = map.law;
  const label = typeof rawLaw === "string" ? rawLaw : `<entry #${i + 1}>`;

  checkKeys(label, map, ENTRY_KEYS);

  if (typeof rawLaw !== "string") {
    errors.push(`${label}: 'law' must be a string`);
  } else if (!liveLawIds.has(rawLaw)) {
    errors.push(`${label}: names no live law`);
  } else {
    lawEntryCount.set(rawLaw, (lawEntryCount.get(rawLaw) ?? 0) + 1);
  }

  registerHandle(label, map.handle);

  if ("absorbs" in map) {
    const a = map.absorbs;
    if (!Array.isArray(a) || a.some((x) => typeof x !== "string")) {
      errors.push(`${label}: 'absorbs' must be a list of ids`);
    } else {
      for (const x of a as string[]) {
        if (!LAW_ID_RE.test(x)) {
          errors.push(`${label}: absorbed id '${x}' does not match ${LAW_ID_RE.source}`);
        } else if (!Object.hasOwn(FAMILIES, familyOf(x))) {
          errors.push(
            `${label}: absorbed id '${x}' has family '${familyOf(x)}' which is not registered — known families are [${KNOWN_FAMILIES}]`,
          );
        } else if (!knownOldIds.has(x)) {
          errors.push(`${label}: absorbed id '${x}' is not a known old id`);
        } else {
          corpus.absorbedIds.push(x);
        }
      }
    }
  }

  if ("checks" in map) {
    const c = map.checks;
    if (!Array.isArray(c) || c.length === 0) {
      errors.push(`${label}: 'checks' must be a non-empty list`);
    } else {
      for (const ch of c) {
        const cm = asMap(ch);
        if (cm === null) {
          errors.push(`${label}: each check must be a mapping`);
          continue;
        }
        checkKeys(label, cm, CHECK_KEYS, "check ");
        for (const k of ["question", "criteria"]) {
          if (k in cm && typeof cm[k] !== "string") {
            errors.push(`${label}: check.'${k}' must be a string`);
          }
        }
      }
    }
  }

  if ("mechanism" in map) {
    const m = map.mechanism;
    if (!Array.isArray(m) || m.length === 0) {
      errors.push(`${label}: 'mechanism' must be a non-empty list`);
    } else {
      const bad = m.filter((x) => typeof x !== "string" || !LADDER.includes(x as string));
      if (bad.length > 0) {
        errors.push(
          `${label}: mechanism [${bad.map(String).join(", ")}] outside the ladder [${KNOWN_LADDER}]`,
        );
      }
    }
  }

  if ("severity" in map && map.severity !== SEVERITY) {
    errors.push(`${label}: severity '${String(map.severity)}' must be ${SEVERITY}`);
  }

  if ("waiver" in map && typeof map.waiver !== "string") {
    errors.push(`${label}: 'waiver' must be a string`);
  }

  if ("incidents" in map) {
    const inc = map.incidents;
    if (!Array.isArray(inc) || inc.some((x) => typeof x !== "string")) {
      errors.push(`${label}: 'incidents' must be a list of strings`);
    } else if (inc.length < 2) {
      errors.push(`${label}: fewer than two incidents (found ${inc.length})`);
    }
  }
}

const judgingIds = new Set<string>();
for (let i = 0; i < corpus.judging.length; i++) {
  const map = asMap(corpus.judging[i]);
  if (map === null) {
    errors.push(`judging entry #${i + 1}: not a mapping`);
    continue;
  }
  const rawId = map.id;
  const label = typeof rawId === "string" ? rawId : `<judging #${i + 1}>`;
  checkKeys(label, map, JUDGING_KEYS);
  for (const k of ["id", "rule"]) {
    if (k in map && typeof map[k] !== "string") {
      errors.push(`${label}: '${k}' must be a string`);
    }
  }
  if (typeof rawId === "string") {
    if (!LAW_ID_RE.test(rawId)) {
      errors.push(`${label}: judging id '${rawId}' does not match ${LAW_ID_RE.source}`);
    } else if (!Object.hasOwn(FAMILIES, familyOf(rawId))) {
      errors.push(
        `${label}: judging id '${rawId}' has family '${familyOf(rawId)}' which is not registered — known families are [${KNOWN_FAMILIES}]`,
      );
    }
    if (judgingIds.has(rawId)) errors.push(`${rawId}: duplicate id`);
    judgingIds.add(rawId);
  }
  registerHandle(label, map.handle);
}

for (let i = 0; i < corpus.retired.length; i++) {
  const map = asMap(corpus.retired[i]);
  if (map === null) {
    errors.push(`retired entry #${i + 1}: not a mapping`);
    continue;
  }
  const rawId = map.id;
  const label = typeof rawId === "string" ? rawId : `<retired #${i + 1}>`;
  checkKeys(label, map, RETIRED_KEYS);
  if (typeof rawId !== "string") errors.push(`${label}: 'id' must be a string`);
  if (typeof map.reason !== "string" || map.reason.trim().length === 0) {
    errors.push(`${label}: 'reason' must be a non-empty string`);
  }
  if (typeof rawId === "string") {
    if (!knownOldIds.has(rawId)) {
      errors.push(`${label}: retired id '${rawId}' is not a known old id`);
    } else {
      corpus.retiredIds.push(rawId);
    }
  }
}

const idCounts = new Map<string, number>();
const bump = (id: string) => idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
for (const id of liveLawIds) bump(id);
for (const id of judgingIds) bump(id);
for (const id of corpus.absorbedIds) bump(id);
for (const id of corpus.retiredIds) bump(id);
for (const [id, n] of idCounts) {
  if (n > 1) {
    errors.push(`${id}: id appears more than once across live laws, judging ids, absorbs lists, and retired`);
  }
}

for (const id of liveLawIds) {
  const n = lawEntryCount.get(id) ?? 0;
  if (n === 0) errors.push(`law ${id}: no enforcement entry`);
  if (n > 1) errors.push(`law ${id}: ${n} enforcement entries`);
}

if (corpusText !== null) {
  const parsedCorpusIds = corpus.entries.length + corpus.judging.length + corpus.retired.length;
  if (rawCorpusIds > parsedCorpusIds) {
    errors.push(
      `${ENFORCEMENT}: ${rawCorpusIds} corpus id(s) declared in the raw block but only ${parsedCorpusIds} parsed — unterminated fence or a dropped entry`,
    );
  }
}

const validTargets = new Set<string>([
  ...liveLawIds,
  ...judgingIds,
  ...corpus.absorbedIds,
]);
const dangling: Record<string, string[]> = {};
for (const p of PATHS) {
  const lines = texts[p].split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isDeclaredDefinition(p, i, line)) continue;
    for (const m of line.matchAll(CITE_RE)) {
      const id = m[0];
      if (validTargets.has(id)) continue;
      (dangling[p] ??= []).push(id);
    }
  }
}
for (const p of PATHS) {
  const ids = [...new Set(dangling[p] ?? [])].sort();
  for (const id of ids) {
    errors.push(`dangling citation: '${id}' is cited in ${p} but is neither a live law, a judging rule, nor an absorbed id`);
  }
}

const totalRawIds = rawLawIds + rawCorpusIds;

let againstAccountingOnly = false;
let vacated: string[] = [];
let uncompared: string[] = [];

function idsFromConstitutionAtRev(text: string): string[] {
  const ids: string[] = [];
  for (const b of extractBlocks(`${CONSTITUTION}@rev`, text)) {
    let doc: unknown;
    try {
      doc = parse(b.body);
    } catch {
      continue;
    }
    const seq = Array.isArray(doc)
      ? doc
      : (asMap(doc)?.rules as unknown[] | undefined);
    if (!Array.isArray(seq)) continue;
    for (const it of seq) {
      const id = asMap(it)?.id;
      if (typeof id === "string") ids.push(id);
    }
  }
  return ids;
}

async function gitShow(rev: string, path: string): Promise<string | null> {
  const cmd = new Deno.Command("git", {
    // `<rev>:./<path>` resolves `<path>` from this process's directory, so a
    // corpus vendored in a subdirectory of its repo compares correctly.
    args: ["show", `${rev}:./${path}`],
    cwd: Deno.cwd(),
    // Spawning with an explicit env needs unscoped `--allow-run`; clearing the
    // child env is the one route that keeps the run permission scoped, and it
    // drops any LD_*/DYLD_* variable Deno refuses to pass along.
    clearEnv: true,
    stdout: "piped",
    stderr: "piped",
  });
  const out = await cmd.output();
  if (!out.success) return null;
  return new TextDecoder().decode(out.stdout);
}

if (against !== undefined) {
  if (constAtRev === null) uncompared.push(CONSTITUTION);
  if (enfAtRev === null) uncompared.push(ENFORCEMENT);

  const oldIds = new Set<string>(constAtRev !== null ? idsFromConstitutionAtRev(constAtRev) : []);

  const handlesAtRev = new Map<string, string>();
  const absorbedAtRev = new Set<string>();
  const retiredAtRev = new Set<string>();
  let hasCorpusAtRev = false;

  if (enfAtRev !== null) {
    const atRev = readCorpus(enfAtRev);
    if (atRev.hasMap) {
      hasCorpusAtRev = true;
      for (const e of atRev.entries) {
        const em = asMap(e);
        if (em === null) continue;
        if (typeof em.law === "string") {
          oldIds.add(em.law);
          if (typeof em.handle === "string") handlesAtRev.set(em.law, em.handle);
        }
        if (Array.isArray(em.absorbs)) {
          for (const a of em.absorbs) if (typeof a === "string") absorbedAtRev.add(a);
        }
      }
      for (const e of atRev.judging) {
        const em = asMap(e);
        if (em === null) continue;
        if (typeof em.id === "string") {
          oldIds.add(em.id);
          if (typeof em.handle === "string") handlesAtRev.set(em.id, em.handle);
        }
      }
      for (const e of atRev.retired) {
        const em = asMap(e);
        if (em !== null && typeof em.id === "string") retiredAtRev.add(em.id);
      }
    }
  }

  for (const id of absorbedAtRev) oldIds.add(id);
  for (const id of retiredAtRev) oldIds.add(id);
  const sortedOldIds = [...oldIds].sort();

  if (oldIds.size === 0) {
    errors.push(
      `--against ${against}: no ids found at that revision — wrong rev, or every file renamed`,
    );
  } else {
    const liveNow = new Set<string>([...liveLawIds, ...judgingIds]);
    const absorbedNow = new Set<string>(corpus.absorbedIds);
    const retiredNow = new Set<string>(corpus.retiredIds);

    for (const id of sortedOldIds) {
      if (liveNow.has(id) || absorbedNow.has(id) || retiredNow.has(id)) continue;
      errors.push(`unaccounted id ${id}`);
    }

    if (hasCorpusAtRev) {
      for (const id of sortedOldIds) {
        if (!liveNow.has(id)) continue;
        const oldHandle = handlesAtRev.get(id);
        const nowHandle = handleById.get(id);
        if (oldHandle !== undefined && nowHandle !== undefined && oldHandle !== nowHandle) {
          errors.push(
            `reassigned id ${id}: handle '${oldHandle}' at ${against}, '${nowHandle}' now`,
          );
        }
      }
      for (const id of [...new Set([...absorbedAtRev, ...retiredAtRev])].sort()) {
        if (liveNow.has(id)) {
          errors.push(`resurrected id ${id}: absorbed or retired at ${against} but live now`);
        }
      }
    } else {
      againstAccountingOnly = true;
    }

    vacated = sortedOldIds.filter((id) =>
      !liveNow.has(id) && (absorbedNow.has(id) || retiredNow.has(id))
    );
  }
}

if (corpusMissing) {
  if (structuralErrorCount > 0) fail(errors.slice(0, structuralErrorCount));
  unmeasurable(`${ENFORCEMENT}: no ## Corpus block — the corpus is unmeasurable`);
}
if (errors.length > 0) fail(errors);
if (laws.length === 0) {
  unmeasurable(`${CONSTITUTION}: declares no laws — the law text is unmeasurable`);
}
if (corpusText !== null && corpus.entries.length === 0) {
  unmeasurable(`${ENFORCEMENT}: ## Corpus contributes no law entries — the corpus is unmeasurable`);
}
if (totalRawIds === 0) {
  unmeasurable("no identifiers matched in either file — the corpus is empty, or the id syntax moved");
}

const totalBlocks = lawBlocks.length + extractBlocks(ENFORCEMENT, enfText).length;
let line =
  `valid: ${laws.length} laws, ${corpus.judging.length} judging rules, ${corpus.absorbedIds.length} absorbed, ` +
  `${corpus.retired.length} retired across ${totalBlocks} yaml blocks in ${PATHS.length} files, ` +
  `${Object.keys(FAMILIES).length} families`;
if (against !== undefined && againstAccountingOnly) {
  line += `; lineage by accounting only, no handles at ${against}`;
}
if (against !== undefined && uncompared.length > 0) {
  line += `; not compared: ${uncompared.sort().join(", ")}`;
}
console.log(line);
if (against !== undefined && uncompared.length > 0) {
  console.log(`comparison against ${against} is not complete`);
}
if (against !== undefined && vacated.length > 0) {
  console.log(`vacated since ${against}: ${vacated.join(", ")}`);
}
