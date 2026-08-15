import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import typia from "typia";

import { EvidenceBenchmarkLayout } from "./EvidenceBenchmarkLayout";
import type {
  ITtscEvidenceBenchmarkSuspension,
  ITtscEvidenceBenchmarkSuspensionLog,
} from "./structures/ITtscEvidenceBenchmarkSuspension";

export interface ITtscEvidenceBenchmarkPowerInterval {
  startedAt: string;
  endedAt: string;
}

export interface ITtscEvidenceBenchmarkSuspensionAuditResult {
  runs: number;
  intervals: number;
  added: number;
}

interface IAuditCell {
  engine: "codex";
  subject: string;
  arm: "plain" | "evidence";
  runId: string;
  model: string;
}

interface IAuditGoal {
  index: number;
  goal?: {
    status?: string;
    updatedAt?: number;
  } | null;
}

interface IAuditStateFile {
  cell: IAuditCell;
  records: {
    events: string;
  };
  state: {
    nextInstructionIndex: number;
    status: string;
    goals: IAuditGoal[];
    processes: unknown[];
  };
}

interface IAuditRun {
  root: string;
  file: IAuditStateFile;
  launchedAt: number;
  lastRecordedAt: number;
}

interface IEventNeighbor {
  processIndex: number;
  recordedAt: number;
}

interface IIntervalObservation {
  interval: ITtscEvidenceBenchmarkPowerInterval;
  startedAt: number;
  endedAt: number;
  before?: IEventNeighbor;
  after?: IEventNeighbor;
  inside: boolean;
}

/** Audits the latest cells against verified Windows disconnected-standby logs. */
export const auditWindowsEvidenceBenchmarkSuspensions = (
  repository: string,
  runIds?: readonly string[],
): ITtscEvidenceBenchmarkSuspensionAuditResult => {
  const runs: IAuditRun[] = selectRuns(scanRuns(repository), runIds);
  if (runs.length === 0) return { runs: 0, intervals: 0, added: 0 };
  if (process.platform !== "win32")
    throw new Error(
      "Automatic suspension auditing currently requires Windows Kernel-Power logs.",
    );
  const startedAt: number = Math.min(...runs.map((run) => run.launchedAt));
  return auditSelectedRuns(runs, readWindowsDisconnectedIntervals(startedAt));
};

/** Applies already verified power intervals; exported for deterministic tests. */
export const auditEvidenceBenchmarkSuspensions = (
  repository: string,
  intervals: readonly ITtscEvidenceBenchmarkPowerInterval[],
  runIds?: readonly string[],
): ITtscEvidenceBenchmarkSuspensionAuditResult =>
  auditSelectedRuns(selectRuns(scanRuns(repository), runIds), intervals);

const auditSelectedRuns = (
  runs: readonly IAuditRun[],
  intervals: readonly ITtscEvidenceBenchmarkPowerInterval[],
): ITtscEvidenceBenchmarkSuspensionAuditResult => {
  const verified: IIntervalObservation[] = intervals
    .map(parseInterval)
    .sort((left, right) => left.startedAt - right.startedAt);
  validateIntervals(verified);
  let added: number = 0;
  for (const run of runs) added += auditRun(run, verified);
  return { runs: runs.length, intervals: verified.length, added };
};

const scanRuns = (repository: string): IAuditRun[] => {
  const output: string = path.join(
    EvidenceBenchmarkLayout.assetsRoot(repository),
    "output",
  );
  if (!fs.existsSync(output)) return [];
  const runs: IAuditRun[] = [];
  for (const subject of directories(output))
    for (const engine of directories(path.join(output, subject)))
      for (const arm of directories(path.join(output, subject, engine))) {
        const root: string = path.join(output, subject, engine, arm, "runs");
        if (!fs.existsSync(root)) continue;
        for (const runId of directories(root)) {
          const runRoot: string = path.join(root, runId);
          const statePath: string = path.join(runRoot, "state.json");
          if (!fs.existsSync(statePath)) continue;
          const file: IAuditStateFile = typia.assert<IAuditStateFile>(
            JSON.parse(fs.readFileSync(statePath, "utf8")),
          );
          const launchedAt: number = readFirstRecordedAt(
            file.records.events,
            statePath,
          );
          runs.push({
            root: runRoot,
            file,
            launchedAt,
            lastRecordedAt:
              readLastRecordedAt(file.records.events) ?? launchedAt,
          });
        }
      }
  return runs;
};

const selectRuns = (
  runs: readonly IAuditRun[],
  runIds: readonly string[] | undefined,
): IAuditRun[] => {
  if (runIds !== undefined) {
    const requested: Set<string> = new Set(runIds);
    if (requested.size !== runIds.length)
      throw new Error("Benchmark suspension-audit run IDs must be unique.");
    const selected: IAuditRun[] = runs.filter((run) =>
      requested.has(run.file.cell.runId),
    );
    const found: Set<string> = new Set(
      selected.map((run) => run.file.cell.runId),
    );
    const missing: string[] = runIds.filter((runId) => !found.has(runId));
    if (missing.length !== 0)
      throw new Error(
        `Unknown benchmark suspension-audit run IDs: ${missing.join(", ")}.`,
      );
    return selected;
  }
  const latest: Map<string, IAuditRun> = new Map();
  for (const run of runs) {
    const cell: IAuditCell = run.file.cell;
    const key: string = [cell.model, cell.engine, cell.subject, cell.arm].join(
      "\u0000",
    );
    const previous: IAuditRun | undefined = latest.get(key);
    if (previous === undefined || previous.launchedAt < run.launchedAt)
      latest.set(key, run);
  }
  return [...latest.values()];
};

const auditRun = (
  run: IAuditRun,
  intervals: readonly IIntervalObservation[],
): number => {
  const file: string = path.join(run.root, "suspensions.json");
  const previous: ITtscEvidenceBenchmarkSuspensionLog = fs.existsSync(file)
    ? typia.assert<ITtscEvidenceBenchmarkSuspensionLog>(
        JSON.parse(fs.readFileSync(file, "utf8")),
      )
    : { schemaVersion: 1, suspensions: [] };
  const known: Set<string> = new Set(previous.suspensions.map(suspensionKey));
  const candidates: IIntervalObservation[] = intervals
    .filter(
      (interval) =>
        interval.startedAt >= run.launchedAt &&
        interval.endedAt <= run.lastRecordedAt &&
        !known.has(intervalKey(interval.interval)),
    )
    .map((interval) => ({ ...interval, inside: false }));
  if (candidates.length === 0) return 0;
  observeEventNeighbors(run.file.records.events, candidates);
  const additions: ITtscEvidenceBenchmarkSuspension[] = [];
  for (const observation of candidates) {
    if (
      observation.inside ||
      observation.before === undefined ||
      observation.after === undefined ||
      observation.before.processIndex !== observation.after.processIndex
    )
      continue;
    const processIndex: number = observation.before.processIndex;
    if (
      !Number.isSafeInteger(processIndex) ||
      processIndex < 0 ||
      processIndex >= run.file.state.processes.length
    )
      throw new Error(
        `Power-log audit found an invalid process index in ${run.file.cell.runId}.`,
      );
    additions.push({
      processIndex,
      instructionIndex: activeInstructionIndex(
        run.file.state,
        observation.startedAt,
      ),
      startedAt: observation.interval.startedAt,
      endedAt: observation.interval.endedAt,
      source: "verified-power-log",
    });
  }
  if (additions.length === 0) return 0;
  const suspensions: ITtscEvidenceBenchmarkSuspension[] = [
    ...previous.suspensions,
    ...additions,
  ].sort(
    (left, right) => Date.parse(left.startedAt) - Date.parse(right.startedAt),
  );
  writeJsonAtomically(file, { schemaVersion: 1, suspensions });
  return additions.length;
};

const observeEventNeighbors = (
  file: string,
  observations: IIntervalObservation[],
): void => {
  forEachLine(file, (line) => {
    const match: RegExpExecArray | null =
      /^\{"recordedAt":"([^"]+)","processIndex":([0-9]+)/u.exec(line);
    if (match === null) return;
    const recordedAt: number = Date.parse(match[1]!);
    const processIndex: number = Number(match[2]);
    if (!Number.isFinite(recordedAt)) return;
    for (const observation of observations) {
      if (recordedAt < observation.startedAt)
        observation.before = { processIndex, recordedAt };
      else if (recordedAt <= observation.endedAt) observation.inside = true;
      else if (observation.after === undefined)
        observation.after = { processIndex, recordedAt };
    }
  });
};

const activeInstructionIndex = (
  state: IAuditStateFile["state"],
  suspendedAt: number,
): number | null => {
  const goals: IAuditGoal[] = [...state.goals].sort(
    (left, right) => left.index - right.index,
  );
  for (const goal of goals) {
    const completedAt: number | undefined =
      goal.goal?.status === "complete" &&
      typeof goal.goal.updatedAt === "number"
        ? goal.goal.updatedAt * 1_000
        : undefined;
    if (completedAt !== undefined && suspendedAt <= completedAt)
      return goal.index;
  }
  const current: IAuditGoal | undefined = goals.find(
    (goal) => goal.index === state.nextInstructionIndex,
  );
  return state.status === "completed" ? null : (current?.index ?? null);
};

const readWindowsDisconnectedIntervals = (
  startedAt: number,
): ITtscEvidenceBenchmarkPowerInterval[] => {
  const command: string = [
    `$start = [DateTimeOffset]::FromUnixTimeMilliseconds(${Math.floor(startedAt)}).LocalDateTime`,
    // An empty System log is the ordinary case on a machine that never lost
    // power, and `Get-WinEvent` reports it by throwing rather than returning
    // nothing. Catch that one error by its identifier, which does not change
    // with the console locale, and let every other failure surface.
    "$events = @()",
    "try { $events = @(Get-WinEvent -FilterHashtable @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-Kernel-Power'; Id = 172; StartTime = $start } -ErrorAction Stop | Sort-Object TimeCreated) } catch { if ($_.FullyQualifiedErrorId -notlike 'NoMatchingEventsFound*') { throw } }",
    "$rows = @($events | ForEach-Object { $xml = [xml]$_.ToXml(); $powerState = [string](($xml.Event.EventData.Data | Where-Object Name -eq 'State').'#text'); [pscustomobject]@{ recordedAt = $_.TimeCreated.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ'); state = if ($powerState -eq '2') { 'disconnected' } elseif ($powerState -eq '0') { 'connected' } else { 'unknown' } } })",
    "ConvertTo-Json -InputObject $rows -Compress",
  ].join("; ");
  const result = spawnSync(
    "powershell.exe",
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", command],
    { encoding: "utf8", windowsHide: true },
  );
  if (result.status !== 0)
    throw new Error(`Failed to read Windows power logs: ${result.stderr}`);
  const rows: { recordedAt: string; state: string }[] = typia.assert<
    { recordedAt: string; state: string }[]
  >(JSON.parse(result.stdout));
  const intervals: ITtscEvidenceBenchmarkPowerInterval[] = [];
  let disconnectedAt: string | undefined;
  for (const row of rows) {
    if (row.state === "disconnected") disconnectedAt = row.recordedAt;
    else if (row.state === "connected" && disconnectedAt !== undefined) {
      if (Date.parse(row.recordedAt) > Date.parse(disconnectedAt))
        intervals.push({ startedAt: disconnectedAt, endedAt: row.recordedAt });
      disconnectedAt = undefined;
    }
  }
  return intervals;
};

const parseInterval = (
  interval: ITtscEvidenceBenchmarkPowerInterval,
): IIntervalObservation => {
  const startedAt: number = Date.parse(interval.startedAt);
  const endedAt: number = Date.parse(interval.endedAt);
  if (
    !Number.isFinite(startedAt) ||
    !Number.isFinite(endedAt) ||
    endedAt <= startedAt
  )
    throw new Error("Power-log audit received an invalid interval.");
  return { interval, startedAt, endedAt, inside: false };
};

const validateIntervals = (
  intervals: readonly IIntervalObservation[],
): void => {
  for (let index: number = 1; index < intervals.length; ++index)
    if (intervals[index - 1]!.endedAt > intervals[index]!.startedAt)
      throw new Error("Power-log audit received overlapping intervals.");
};

const suspensionKey = (suspension: ITtscEvidenceBenchmarkSuspension): string =>
  `${suspension.startedAt}\u0000${suspension.endedAt}`;

const intervalKey = (interval: ITtscEvidenceBenchmarkPowerInterval): string =>
  `${interval.startedAt}\u0000${interval.endedAt}`;

const readFirstRecordedAt = (events: string, fallback: string): number => {
  let recordedAt: number | undefined;
  forEachLine(
    events,
    (line) => {
      if (recordedAt !== undefined) return;
      const match: RegExpExecArray | null = /^\{"recordedAt":"([^"]+)"/u.exec(
        line,
      );
      if (match === null) return;
      const parsed: number = Date.parse(match[1]!);
      if (Number.isFinite(parsed)) recordedAt = parsed;
    },
    true,
  );
  return recordedAt ?? fs.statSync(fallback).birthtimeMs;
};

const readLastRecordedAt = (file: string): number | undefined => {
  const descriptor: number = fs.openSync(file, "r");
  try {
    const size: number = fs.fstatSync(descriptor).size;
    let position: number = size;
    let suffix: string = "";
    while (position > 0) {
      const length: number = Math.min(64 * 1024, position);
      position -= length;
      const buffer: Buffer = Buffer.alloc(length);
      fs.readSync(descriptor, buffer, 0, length, position);
      const lines: string[] = `${buffer.toString("utf8")}${suffix}`.split("\n");
      const firstComplete: number = position === 0 ? 0 : 1;
      for (
        let index: number = lines.length - 1;
        index >= firstComplete;
        --index
      ) {
        const match: RegExpExecArray | null = /^\{"recordedAt":"([^"]+)"/u.exec(
          lines[index]!,
        );
        if (match === null) continue;
        const recordedAt: number = Date.parse(match[1]!);
        if (Number.isFinite(recordedAt)) return recordedAt;
      }
      suffix = lines[0]!;
    }
    return undefined;
  } finally {
    fs.closeSync(descriptor);
  }
};

const forEachLine = (
  file: string,
  closure: (line: string) => void,
  stopAfterFirst: boolean = false,
): void => {
  const descriptor: number = fs.openSync(file, "r");
  const buffer: Buffer = Buffer.alloc(1024 * 1024);
  let suffix: string = "";
  try {
    while (true) {
      const length: number = fs.readSync(
        descriptor,
        buffer,
        0,
        buffer.length,
        null,
      );
      if (length === 0) break;
      const lines: string[] =
        `${suffix}${buffer.subarray(0, length).toString("utf8")}`.split("\n");
      suffix = lines.pop()!;
      for (const line of lines) {
        closure(line);
        if (stopAfterFirst) return;
      }
    }
    if (suffix.length !== 0) closure(suffix);
  } finally {
    fs.closeSync(descriptor);
  }
};

const writeJsonAtomically = (file: string, value: unknown): void => {
  const temporary: string = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, file);
};

const directories = (root: string): string[] =>
  fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
