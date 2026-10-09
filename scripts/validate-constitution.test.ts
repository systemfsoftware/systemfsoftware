#!/usr/bin/env -S deno run --allow-write=/tmp --allow-run=deno,git,sh --allow-env
const TREE_ROOT = new URL("../", import.meta.url).pathname;
const CONFIG = new URL("../deno.json", import.meta.url).pathname;
const VALIDATOR_ARG = Deno.env.get("VALIDATOR_PATH") ?? "scripts/validate-constitution.ts";
const VALIDATOR = VALIDATOR_ARG.startsWith("/")
  ? VALIDATOR_ARG
  : new URL(VALIDATOR_ARG, `file://${TREE_ROOT}`).pathname;
const HOOK_ARG = Deno.env.get("HOOK_PATH") ?? ".husky/pre-commit";
const HOOK = HOOK_ARG.startsWith("/")
  ? HOOK_ARG
  : new URL(HOOK_ARG, `file://${TREE_ROOT}`).pathname;

// Deno refuses to hand a subprocess any LD_*/DYLD_* variable, and giving a spawn
// an explicit `env` needs unscoped `--allow-run`. Stripping those names from this
// process's environment once is the one route that leaves `--allow-run` scoped;
// every spawn below, and the validator it launches, then inherits a clean env.
for (const name of Object.keys(Deno.env.toObject())) {
  if (name.startsWith("LD_") || name.startsWith("DYLD_")) Deno.env.delete(name);
}

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
    // Keep this child's env: it needs PATH to resolve the validator's own git
    // spawn. LD_*/DYLD_* were already stripped from this process above.
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
    clearEnv: true,
    stdout: "piped",
    stderr: "piped",
  });
  const o = await cmd.output();
  if (!o.success) {
    throw new Error(`git ${args.join(" ")} failed: ${decode(o.stderr)}`);
  }
}

async function runHook(cwd: string): Promise<Result> {
  const cmd = new Deno.Command("sh", {
    args: [HOOK],
    cwd,
    stdout: "piped",
    stderr: "piped",
  });
  const o = await cmd.output();
  return { code: o.code, out: decode(o.stdout) + decode(o.stderr) };
}

/**
 * A temp repo's `deno.json`. `test` drives the real validator on the corpus so
 * the hook has the corpus gate to run; `test:validator` is a stub that always
 * passes, so the pre-fix hook (whose exit status is its last line) can mask a
 * failing `test` — which is the defect under test. The stub is reachable, so
 * the valid-corpus control asserts a real 0.
 */
function hookDenoJson(): string {
  return `${JSON.stringify({
    tasks: {
      "test":
        `deno run --quiet --allow-read=CONSTITUTION.md,ENFORCEMENT.md --allow-run=git --config=${CONFIG} ${VALIDATOR}`,
      "test:validator": `deno eval "Deno.exit(0)"`,
    },
  }, null, 2)}\n`;
}

async function commitAll(dir: string, message: string): Promise<void> {
  await runGit(dir, ["add", "-A"]);
  await runGit(dir, ["commit", "-qm", message]);
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

const G2_LAW = `
\`\`\`yaml
- id: CONST-G2
  law: A freshly minted governance law.
  why: The lineage can retire what it just created.
  example:
    wrong: "Keep it forever."
    right: "Retire it, with a reason."
\`\`\`
`;
const CONSTITUTION_WITH_G2 = `${CONSTITUTION}${G2_LAW}`;
const ENF_RETIRED_G2 = ENFORCEMENT.replace(
  '  - id: CONST-E7\n    reason: "Folded into CONST-G1."\n',
  '  - id: CONST-E7\n    reason: "Folded into CONST-G1."\n  - id: CONST-G2\n    reason: "Retired the same day."\n',
);
const ENF_ABSORBS_G2 = ENFORCEMENT.replace(
  "absorbs: [CONST-B1, CONST-B2]",
  "absorbs: [CONST-B1, CONST-B2, CONST-G2]",
);
const ENF_G2_ENTRY = ENFORCEMENT.replace(
  "judging:\n",
  `  - law: CONST-G2
    handle: FRESH-GOVERNANCE
    absorbs: []
    checks:
      - question: "Is the freshly minted law covered?"
        criteria: "It is."
    mechanism: [review]
    severity: P0
    waiver: "None."
    incidents: ${INCIDENTS}
judging:
`,
);

function assertOk(result: Result, label: string): void {
  assert(
    result.code === 0,
    `${label}: expected exit 0, got ${result.code}; output: ${result.out}`,
  );
}

test("#fix1a: an id live at the comparison revision may be retired, with and without --against", async () => {
  assert(CONSTITUTION_WITH_G2.includes("CONST-G2"), "fixture edit failed");
  assert(ENF_RETIRED_G2 !== ENFORCEMENT, "fixture edit failed");
  await withCorpus({ constitution: CONSTITUTION_WITH_G2, enforcement: ENFORCEMENT }, async (dir) => {
    await runGit(dir, ["init", "-q"]);
    await runGit(dir, ["add", "-A"]);
    await runGit(dir, ["commit", "-qm", "rev"]);
    await runGit(dir, ["tag", "rev"]);

    await Deno.writeTextFile(`${dir}/CONSTITUTION.md`, CONSTITUTION);
    await Deno.writeTextFile(`${dir}/ENFORCEMENT.md`, ENF_RETIRED_G2);

    const noFlag = await runValidator(dir);
    assert(noFlag.code === 0, `no-flag expected exit 0, got ${noFlag.code}; output: ${noFlag.out}`);
    const against = await runValidator(dir, ["--against", "rev"]);
    assert(against.code === 0, `--against expected exit 0, got ${against.code}; output: ${against.out}`);
  });
});

test("#fix1b: an id live at the comparison revision may be absorbed, with and without --against", async () => {
  assert(ENF_ABSORBS_G2 !== ENFORCEMENT, "fixture edit failed");
  await withCorpus({ constitution: CONSTITUTION_WITH_G2, enforcement: ENFORCEMENT }, async (dir) => {
    await runGit(dir, ["init", "-q"]);
    await runGit(dir, ["add", "-A"]);
    await runGit(dir, ["commit", "-qm", "rev"]);
    await runGit(dir, ["tag", "rev"]);

    await Deno.writeTextFile(`${dir}/CONSTITUTION.md`, CONSTITUTION);
    await Deno.writeTextFile(`${dir}/ENFORCEMENT.md`, ENF_ABSORBS_G2);

    const noFlag = await runValidator(dir);
    assert(noFlag.code === 0, `no-flag expected exit 0, got ${noFlag.code}; output: ${noFlag.out}`);
    const against = await runValidator(dir, ["--against", "rev"]);
    assert(against.code === 0, `--against expected exit 0, got ${against.code}; output: ${against.out}`);
  });
});

test("#fix1c: a fabricated id is rejected with and without --against", async () => {
  await withCorpus({ constitution: CONSTITUTION, enforcement: ENFORCEMENT }, async (dir) => {
    await runGit(dir, ["init", "-q"]);
    await runGit(dir, ["add", "-A"]);
    await runGit(dir, ["commit", "-qm", "rev"]);
    await runGit(dir, ["tag", "rev"]);

    await Deno.writeTextFile(`${dir}/ENFORCEMENT.md`, ENF_RETIRED_G2);

    assertFailsWith(
      await runValidator(dir),
      "retired id 'CONST-G2' is not a known old id",
    );
    assertFailsWith(
      await runValidator(dir, ["--against", "rev"]),
      "retired id 'CONST-G2' is not a known old id",
    );
  });
});

test("#fix1d: an id minted and then retired across two commits stays accepted", async () => {
  await withCorpus({ constitution: CONSTITUTION_WITH_G2, enforcement: ENF_G2_ENTRY }, async (dir) => {
    await runGit(dir, ["init", "-q"]);

    // Commit 1: G2 is minted and live.
    assertOk(await runValidator(dir), "mint");
    await commitAll(dir, "mint CONST-G2");

    // Commit 2: G2 is removed from the law text and retired.
    await Deno.writeTextFile(`${dir}/CONSTITUTION.md`, CONSTITUTION);
    await Deno.writeTextFile(`${dir}/ENFORCEMENT.md`, ENF_RETIRED_G2);
    assertOk(await runValidator(dir), "retire, HEAD still holds G2 live");
    await commitAll(dir, "retire CONST-G2");

    // Commit 3: an unrelated edit. HEAD now holds G2 retired, not live.
    await Deno.writeTextFile(`${dir}/ENFORCEMENT.md`, `${ENF_RETIRED_G2}\nUnrelated prose.\n`);
    await commitAll(dir, "unrelated edit");

    assertOk(await runValidator(dir), "no flag, G2 retired at HEAD");
    assertOk(await runValidator(dir, ["--against", "HEAD"]), "--against HEAD, G2 retired at HEAD");
  });
});

test("#fix1e: an id minted and then absorbed across two commits stays accepted", async () => {
  await withCorpus({ constitution: CONSTITUTION_WITH_G2, enforcement: ENF_G2_ENTRY }, async (dir) => {
    await runGit(dir, ["init", "-q"]);

    // Commit 1: G2 is minted and live.
    assertOk(await runValidator(dir), "mint");
    await commitAll(dir, "mint CONST-G2");

    // Commit 2: G2 is removed from the law text and absorbed into CONST-G1.
    await Deno.writeTextFile(`${dir}/CONSTITUTION.md`, CONSTITUTION);
    await Deno.writeTextFile(`${dir}/ENFORCEMENT.md`, ENF_ABSORBS_G2);
    assertOk(await runValidator(dir), "absorb, HEAD still holds G2 live");
    await commitAll(dir, "absorb CONST-G2");

    // Commit 3: an unrelated edit. HEAD now holds G2 absorbed, not live.
    await Deno.writeTextFile(`${dir}/ENFORCEMENT.md`, `${ENF_ABSORBS_G2}\nUnrelated prose.\n`);
    await commitAll(dir, "unrelated edit");

    assertOk(await runValidator(dir), "no flag, G2 absorbed at HEAD");
    assertOk(await runValidator(dir, ["--against", "HEAD"]), "--against HEAD, G2 absorbed at HEAD");
  });
});

test("#hook: the pre-commit hook fails when deno task test fails", async () => {
  const dir = await Deno.makeTempDir({ dir: "/tmp", prefix: "constitution-hook-" });
  try {
    const dangling = ENFORCEMENT.replace(
      "Doctrine prose. Gates fail commands, not clauses.",
      "Doctrine prose. CONST-Q42 governs the gate.",
    );
    assert(dangling !== ENFORCEMENT, "fixture edit failed");
    await Deno.writeTextFile(`${dir}/CONSTITUTION.md`, CONSTITUTION);
    await Deno.writeTextFile(`${dir}/ENFORCEMENT.md`, dangling);
    await Deno.writeTextFile(`${dir}/deno.json`, hookDenoJson());
    await runGit(dir, ["init", "-q"]);
    await commitAll(dir, "dangling corpus");

    // The dangling citation fails `deno task test`; the hook must not mask it.
    const red = await runHook(dir);
    assert(
      red.code !== 0,
      `expected the hook to exit non-zero on a dangling corpus, got ${red.code}; output: ${red.out}`,
    );

    // Control: a valid corpus, with test:validator reachable, must exit 0.
    await Deno.writeTextFile(`${dir}/ENFORCEMENT.md`, ENFORCEMENT);
    const control = await runHook(dir);
    assert(
      control.code === 0,
      `expected the hook to exit 0 on a valid corpus, got ${control.code}; output: ${control.out}`,
    );
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

test("#fix2: --against resolves a corpus vendored in a subdirectory", async () => {
  const root = await Deno.makeTempDir({ dir: "/tmp", prefix: "constitution-nested-" });
  try {
    const nested = `${root}/vendor/constitution`;
    await Deno.mkdir(nested, { recursive: true });
    await Deno.writeTextFile(`${nested}/CONSTITUTION.md`, CONSTITUTION);
    await Deno.writeTextFile(`${nested}/ENFORCEMENT.md`, ENFORCEMENT);
    await runGit(root, ["init", "-q"]);
    await runGit(root, ["add", "-A"]);
    await runGit(root, ["commit", "-qm", "rev"]);
    await runGit(root, ["tag", "rev"]);

    const r = await runValidator(nested, ["--against", "rev"]);
    assert(r.code === 0, `expected exit 0, got ${r.code}; output: ${r.out}`);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

test("#fix5: a quoted id in an unmeasured fence escapes the raw-vs-parsed coverage count", async () => {
  // The fence info string carries a space, so `extractBlocks` never sees the
  // block and its law is silently unmeasured. Pre-fix the raw count missed the
  // quoted id too, so the coverage check stayed silent and the defect passed.
  const misFenced = `${CONSTITUTION}
\`\`\` yaml
- id: "CONST-G1"
  law: A shadowed copy the fence never measures.
  why: The fence info string carries a space.
  example:
    wrong: "Trust a slightly different fence."
    right: "Use exactly three backticks and yaml."
\`\`\`
`;
  await withCorpus({ constitution: misFenced, enforcement: ENFORCEMENT }, async (dir) => {
    assertFailsWith(
      await runValidator(dir),
      "law id(s) declared in the raw text but only",
    );
  });
});

test("#4a: a duplicate handle is rejected", async () => {
  const dup = ENFORCEMENT.replace("handle: GATE-FAILS-COMMAND", "handle: LEGIBLE-LAW");
  assert(dup !== ENFORCEMENT, "fixture edit failed");
  await withCorpus({ enforcement: dup }, async (dir) => {
    assertFailsWith(await runValidator(dir), "handle 'LEGIBLE-LAW' is not unique");
  });
});

test("#4b: a law with no enforcement entry is rejected", async () => {
  await withCorpus({ constitution: CONSTITUTION_WITH_G2, enforcement: ENFORCEMENT }, async (dir) => {
    assertFailsWith(await runValidator(dir), "law CONST-G2: no enforcement entry");
  });
});

test("#4c: a law with two enforcement entries is rejected", async () => {
  const extra = `  - law: CONST-G1
    handle: SECOND-G1-HANDLE
    absorbs: []
    checks:
      - question: "Is the law legible twice?"
        criteria: "It is not."
    mechanism: [review]
    severity: P0
    waiver: "None."
    incidents: ${INCIDENTS}
`;
  const two = ENFORCEMENT.replace("judging:\n", `${extra}judging:\n`);
  assert(two !== ENFORCEMENT, "fixture edit failed");
  await withCorpus({ enforcement: two }, async (dir) => {
    assertFailsWith(await runValidator(dir), "law CONST-G1: 2 enforcement entries");
  });
});

test("#4d: a dangling citation to an invented id is rejected", async () => {
  const cited = ENFORCEMENT.replace(
    "Doctrine prose. Gates fail commands, not clauses.",
    "Doctrine prose. CONST-G9 governs the gate.",
  );
  assert(cited !== ENFORCEMENT, "fixture edit failed");
  await withCorpus({ enforcement: cited }, async (dir) => {
    assertFailsWith(await runValidator(dir), "dangling citation: 'CONST-G9'");
  });
});

test("#4e: an id on a definition line is not counted as a citation", async () => {
  const defLines = ENFORCEMENT.replace(
    "## Corpus",
    `Prose that defines, not cites:
- id: CONST-Q1
- law: CONST-Q2
- CONST-Q3
absorbs: [CONST-Q4]

## Corpus`,
  );
  assert(defLines !== ENFORCEMENT, "fixture edit failed");
  await withCorpus({ enforcement: defLines }, async (dir) => {
    const r = await runValidator(dir);
    assert(r.code === 0, `expected exit 0, got ${r.code}; output: ${r.out}`);
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
