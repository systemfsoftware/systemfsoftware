#!/usr/bin/env -S deno run --allow-write=/tmp --allow-run=deno,git --allow-env=VALIDATOR_PATH
const TREE_ROOT = new URL("../", import.meta.url).pathname;
const CONFIG = new URL("../deno.json", import.meta.url).pathname;
const VALIDATOR_ARG = Deno.env.get("VALIDATOR_PATH") ?? "scripts/validate-constitution.ts";
const VALIDATOR = VALIDATOR_ARG.startsWith("/")
  ? VALIDATOR_ARG
  : new URL(VALIDATOR_ARG, `file://${TREE_ROOT}`).pathname;

const CONSTITUTION = `# Constitution

The law text lives here.

## Governance

\`\`\`yaml
- id: CONST-G1
  law: A law must be legible.
  why: Because illegible law cannot be applied.
  example:
    wrong: "Write terse law."
    right: "Write plain law."
\`\`\`

## Testing

\`\`\`yaml
- id: CONST-T1
  law: A gate must fail a command.
  why: A gate that cannot fail is a certificate.
  example:
    wrong: "Report success always."
    right: "Exit non-zero on defect."
\`\`\`
`;

const INCIDENTS = `["consumer abc1234:path/f.ts:12 thing", "this repo 0123abc:scripts/x.ts:3 thing"]`;

const ENFORCEMENT = `# Enforcement

Doctrine prose. Gates fail commands, not clauses.

## Corpus

\`\`\`yaml
version: 1
laws:
  - law: CONST-G1
    handle: LEGIBLE-LAW
    absorbs: [CONST-B1, CONST-B2]
    checks:
      - question: "Is the law legible?"
        criteria: "A reader can act on it."
    mechanism: [review]
    severity: P0
    waiver: "None."
    incidents: ${INCIDENTS}
  - law: CONST-T1
    handle: GATE-FAILS-COMMAND
    absorbs: []
    checks:
      - question: "Does the gate fail?"
        criteria: "Exit is non-zero on defect."
    mechanism: [command]
    severity: P0
    waiver: "None."
    incidents: ${INCIDENTS}
judging:
  - id: CONST-G3
    handle: P0-VERDICT
    rule: "Render a verdict of fixed or wrong."
retired:
  - id: CONST-E7
    reason: "Folded into CONST-G1."
\`\`\`
`;

type Result = { code: number; out: string };

function decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

async function runValidator(cwd: string, args: string[] = []): Promise<Result> {
  const cmd = new Deno.Command("deno", {
    args: [
      "run",
      "--quiet",
      "--allow-read=CONSTITUTION.md,ENFORCEMENT.md",
      "--allow-run=git",
      `--config=${CONFIG}`,
      VALIDATOR,
      ...args,
    ],
    cwd,
    stdout: "piped",
    stderr: "piped",
  });
  const o = await cmd.output();
  return { code: o.code, out: decode(o.stdout) + decode(o.stderr) };
}

async function runGit(cwd: string, args: string[]): Promise<void> {
  const cmd = new Deno.Command("git", {
    args: ["-c", "user.email=test@example.com", "-c", "user.name=test", "-c", "commit.gpgsign=false", ...args],
    cwd,
    stdout: "piped",
    stderr: "piped",
  });
  const o = await cmd.output();
  if (!o.success) {
    throw new Error(`git ${args.join(" ")} failed: ${decode(o.stderr)}`);
  }
}

async function withCorpus(
  files: { constitution?: string; enforcement: string },
  fn: (dir: string) => Promise<void>,
): Promise<void> {
  const dir = await Deno.makeTempDir({ dir: "/tmp", prefix: "constitution-test-" });
  try {
    await Deno.writeTextFile(`${dir}/CONSTITUTION.md`, files.constitution ?? CONSTITUTION);
    await Deno.writeTextFile(`${dir}/ENFORCEMENT.md`, files.enforcement);
    await fn(dir);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
}

function assert(cond: boolean, message: string): void {
  if (!cond) throw new Error(message);
}

function assertFailsWith(result: Result, needle: string): void {
  assert(result.code === 1, `expected exit 1, got ${result.code}; output: ${result.out}`);
  assert(
    result.out.includes(needle),
    `expected output to include ${JSON.stringify(needle)}; got: ${result.out}`,
  );
}

function assertUnmeasurable(result: Result, needle = "UNMEASURABLE"): void {
  assert(result.code === 3, `expected exit 3, got ${result.code}; output: ${result.out}`);
  assert(
    result.out.includes(needle),
    `expected output to include ${JSON.stringify(needle)}; got: ${result.out}`,
  );
}

type Case = { name: string; fn: () => Promise<void> };
const cases: Case[] = [];
function test(name: string, fn: () => Promise<void>): void {
  cases.push({ name, fn });
}

test("#green: a valid placeholder corpus exits 0, and --against its own rev exits 0", async () => {
  await withCorpus({ enforcement: ENFORCEMENT }, async (dir) => {
    const r = await runValidator(dir);
    assert(r.code === 0, `expected exit 0, got ${r.code}; output: ${r.out}`);
    assert(r.out.includes("valid: 2 laws, 1 judging rules"), `success line missing: ${r.out}`);

    await runGit(dir, ["init", "-q"]);
    await runGit(dir, ["add", "-A"]);
    await runGit(dir, ["commit", "-qm", "rev"]);
    await runGit(dir, ["tag", "rev"]);
    const against = await runValidator(dir, ["--against", "rev"]);
    assert(against.code === 0, `expected exit 0, got ${against.code}; output: ${against.out}`);
  });
});

test("#1: a fabricated absorbed or retired id is rejected", async () => {
  const citedAbsorbed = ENFORCEMENT
    .replace(
      "Doctrine prose. Gates fail commands, not clauses.",
      "Doctrine prose. CONST-Q9 governs the gate.",
    )
    .replace("absorbs: [CONST-B1, CONST-B2]", "absorbs: [CONST-B5, CONST-Q9]");
  await withCorpus({ enforcement: citedAbsorbed }, async (dir) => {
    assertFailsWith(
      await runValidator(dir),
      "absorbed id 'CONST-Q9' has family 'Q' which is not registered",
    );
  });

  const liveFamilyAbsorbed = ENFORCEMENT.replace(
    "absorbs: [CONST-B1, CONST-B2]",
    "absorbs: [CONST-B5, CONST-B7]",
  );
  await withCorpus({ enforcement: liveFamilyAbsorbed }, async (dir) => {
    assertFailsWith(await runValidator(dir), "absorbed id 'CONST-B7' is not a known old id");
  });

  const fabricatedRetired = ENFORCEMENT.replace(
    "- id: CONST-E7\n    reason: \"Folded into CONST-G1.\"",
    "- id: CONST-Q9\n    reason: \"Folded into CONST-G1.\"",
  );
  await withCorpus({ enforcement: fabricatedRetired }, async (dir) => {
    assertFailsWith(await runValidator(dir), "retired id 'CONST-Q9' is not a known old id");
  });
});

test("#3: --against fails when an id absorbed at rev has no home now", async () => {
  await withCorpus({ enforcement: ENFORCEMENT }, async (dir) => {
    const rev = ENFORCEMENT.replace("absorbs: [CONST-B1, CONST-B2]", "absorbs: [CONST-B1, CONST-B5]");
    await Deno.writeTextFile(`${dir}/ENFORCEMENT.md`, rev);
    await runGit(dir, ["init", "-q"]);
    await runGit(dir, ["add", "-A"]);
    await runGit(dir, ["commit", "-qm", "rev"]);
    await runGit(dir, ["tag", "rev"]);
    await Deno.writeTextFile(
      `${dir}/ENFORCEMENT.md`,
      ENFORCEMENT.replace("absorbs: [CONST-B1, CONST-B2]", "absorbs: [CONST-B1]"),
    );
    assertFailsWith(await runValidator(dir, ["--against", "rev"]), "unaccounted id CONST-B5");
  });
});

test("#12: an absorbed id must match the id shape and carry a registered family", async () => {
  const enf = ENFORCEMENT.replace("absorbs: [CONST-B1, CONST-B2]", "absorbs: [CONST-Z5, CONST-9]");
  await withCorpus({ enforcement: enf }, async (dir) => {
    const r = await runValidator(dir);
    assertFailsWith(r, "absorbed id 'CONST-Z5' has family 'Z' which is not registered");
    assert(
      r.out.includes("absorbed id 'CONST-9' does not match"),
      `expected shape FAIL line; got: ${r.out}`,
    );
  });
});

test("#13: an empty checks list is rejected", async () => {
  const enf = ENFORCEMENT.replace(
    "    checks:\n      - question: \"Is the law legible?\"\n        criteria: \"A reader can act on it.\"\n",
    "    checks: []\n",
  );
  assert(enf.includes("checks: []"), "fixture edit failed");
  await withCorpus({ enforcement: enf }, async (dir) => {
    assertFailsWith(await runValidator(dir), "'checks' must be a non-empty list");
  });
});

test("#item1: a judging id must match the id shape and carry a registered family", async () => {
  const badFamily = ENFORCEMENT.replace("- id: CONST-G3", "- id: CONST-Q9");
  assert(badFamily !== ENFORCEMENT, "fixture edit failed");
  await withCorpus({ enforcement: badFamily }, async (dir) => {
    assertFailsWith(
      await runValidator(dir),
      "judging id 'CONST-Q9' has family 'Q' which is not registered",
    );
  });

  const badShape = ENFORCEMENT.replace("- id: CONST-G3", "- id: CONST-G");
  assert(badShape !== ENFORCEMENT, "fixture edit failed");
  await withCorpus({ enforcement: badShape }, async (dir) => {
    assertFailsWith(
      await runValidator(dir),
      "judging id 'CONST-G' does not match ^CONST-[A-Z]\\d+$",
    );
  });
});

test("#item2: a repeated judging id is rejected", async () => {
  const repeated = ENFORCEMENT.replace(
    '  - id: CONST-G3\n    handle: P0-VERDICT\n    rule: "Render a verdict of fixed or wrong."',
    '  - id: CONST-G3\n    handle: P0-VERDICT\n    rule: "Render a verdict of fixed or wrong."\n' +
      '  - id: CONST-G3\n    handle: SECOND-VERDICT\n    rule: "Render the verdict again."',
  );
  assert(repeated !== ENFORCEMENT, "fixture edit failed");
  await withCorpus({ enforcement: repeated }, async (dir) => {
    assertFailsWith(await runValidator(dir), "CONST-G3: duplicate id");
  });
});

const LAWLESS = `# Constitution

The law text lives here, and for now it declares no laws at all.
`;

const RETIRED_ONLY_CORPUS = `# Enforcement

Doctrine prose. Gates fail commands, not clauses.

## Corpus

\`\`\`yaml
version: 1
retired:
  - id: CONST-E7
    reason: "Superseded by the current governance rule."
\`\`\`
`;

const JUDGING_ONLY_CORPUS = `# Enforcement

Doctrine prose. Gates fail commands, not clauses.

## Corpus

\`\`\`yaml
version: 1
judging:
  - id: CONST-G3
    handle: P0-VERDICT
    rule: "Render a verdict of fixed or wrong."
\`\`\`
`;

test("#item3a: a corpus contributing only a retired id is unmeasurable", async () => {
  await withCorpus(
    { constitution: LAWLESS, enforcement: RETIRED_ONLY_CORPUS },
    async (dir) => {
      assertUnmeasurable(await runValidator(dir), "CONSTITUTION.md: declares no laws");
    },
  );
});

test("#item3b: a corpus contributing only a judging rule is unmeasurable", async () => {
  await withCorpus(
    { constitution: LAWLESS, enforcement: JUDGING_ONLY_CORPUS },
    async (dir) => {
      assertUnmeasurable(await runValidator(dir), "CONSTITUTION.md: declares no laws");
    },
  );
});

test("#item4: --against reports a law whose handle moved", async () => {
  await withCorpus({ enforcement: ENFORCEMENT }, async (dir) => {
    await runGit(dir, ["init", "-q"]);
    await runGit(dir, ["add", "-A"]);
    await runGit(dir, ["commit", "-qm", "rev"]);
    await runGit(dir, ["tag", "rev"]);
    await Deno.writeTextFile(
      `${dir}/ENFORCEMENT.md`,
      ENFORCEMENT.replace("handle: LEGIBLE-LAW", "handle: PLAIN-LAW"),
    );
    assertFailsWith(
      await runValidator(dir, ["--against", "rev"]),
      "reassigned id CONST-G1: handle 'LEGIBLE-LAW' at rev, 'PLAIN-LAW' now",
    );
  });
});

test("#item5: --against reports an id retired at rev that is live now", async () => {
  const liveConstitution = `${CONSTITUTION}
## Enforcement

\`\`\`yaml
- id: CONST-E7
  law: A gate must fail a command.
  why: Because a gate that cannot fail is a certificate.
  example:
    wrong: "Report success always."
    right: "Exit non-zero on defect."
\`\`\`
`;
  const liveEnforcement = ENFORCEMENT
    .replace(
      "judging:\n",
      `  - law: CONST-E7
    handle: E7-GATE-FAILS
    absorbs: []
    checks:
      - question: "Does the gate fail?"
        criteria: "Exit is non-zero on defect."
    mechanism: [command]
    severity: P0
    waiver: "None."
    incidents: ${INCIDENTS}
judging:
`,
    )
    .replace('retired:\n  - id: CONST-E7\n    reason: "Folded into CONST-G1."\n', "");
  assert(liveEnforcement.includes("law: CONST-E7"), "fixture edit failed");
  assert(!liveEnforcement.includes("retired:"), "fixture edit failed");

  await withCorpus(
    { constitution: liveConstitution, enforcement: liveEnforcement },
    async (dir) => {
      await Deno.writeTextFile(`${dir}/CONSTITUTION.md`, CONSTITUTION);
      await Deno.writeTextFile(`${dir}/ENFORCEMENT.md`, ENFORCEMENT);
      await runGit(dir, ["init", "-q"]);
      await runGit(dir, ["add", "-A"]);
      await runGit(dir, ["commit", "-qm", "rev"]);
      await runGit(dir, ["tag", "rev"]);
      await Deno.writeTextFile(`${dir}/CONSTITUTION.md`, liveConstitution);
      await Deno.writeTextFile(`${dir}/ENFORCEMENT.md`, liveEnforcement);
      assertFailsWith(
        await runValidator(dir, ["--against", "rev"]),
        "resurrected id CONST-E7",
      );
    },
  );
});

test("#item6: a missing ## Corpus block is unmeasurable", async () => {
  const noCorpus = ENFORCEMENT.replace(/## Corpus[\s\S]*$/, "Doctrine only.");
  assert(noCorpus !== ENFORCEMENT, "fixture edit failed");
  await withCorpus({ enforcement: noCorpus }, async (dir) => {
    assertUnmeasurable(await runValidator(dir), "no ## Corpus block");
  });
});

test("#item7: a law text padded past the word budget is rejected", async () => {
  const padded = `${CONSTITUTION}\n${"padding ".repeat(2000)}`;
  await withCorpus({ enforcement: ENFORCEMENT, constitution: padded }, async (dir) => {
    assertFailsWith(await runValidator(dir), "exceeds the 1800-word budget");
  });
});

test("#item8: a law entry with a single incident is rejected", async () => {
  const oneIncident = ENFORCEMENT.replace(
    INCIDENTS,
    `["consumer abc1234:path/f.ts:12 thing"]`,
  );
  assert(oneIncident !== ENFORCEMENT, "fixture edit failed");
  await withCorpus({ enforcement: oneIncident }, async (dir) => {
    assertFailsWith(await runValidator(dir), "fewer than two incidents");
  });
});

let failed = 0;
for (const c of cases) {
  try {
    await c.fn();
    console.log(`ok - ${c.name}`);
  } catch (e) {
    failed++;
    console.error(`not ok - ${c.name}\n  ${(e as Error).message}`);
  }
}
if (failed > 0) {
  console.error(`\n${failed} failed, ${cases.length - failed} passed`);
  Deno.exit(1);
}
console.log(`\nall ${cases.length} passed`);
