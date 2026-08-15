import fs from "node:fs";

import type { ITtscEvidenceBenchmarkApiCost } from "./structures/ITtscEvidenceBenchmarkApiCost";
import type { ITtscEvidenceBenchmarkTokenUsage } from "./structures/ITtscEvidenceBenchmarkTokenUsage";

interface ITokenPrice {
  input: number;
  cachedInput: number;
  cacheWriteInput: number;
  output: number;
}

interface IModelPrice {
  short: ITokenPrice;
  long: ITokenPrice;
}

interface ITokenUsageUpdate {
  total: ITtscEvidenceBenchmarkTokenUsage;
  last: ITtscEvidenceBenchmarkTokenUsage;
}

export interface ITtscEvidenceBenchmarkApiCostProps {
  /**
   * Retained stage logs of one run, in objective order.
   *
   * The native stream is split across one file per stage, and a chunk boundary
   * can fall inside a JSON line, so these are read as a single concatenated
   * stream rather than as independent files.
   */
  stageLogs: readonly string[];
  model: string;
  initial?: ITtscEvidenceBenchmarkTokenUsage;
  expected: ITtscEvidenceBenchmarkTokenUsage;
  strict: boolean;
}

const LONG_CONTEXT_THRESHOLD_TOKENS = 272_000 as const;
const PRICING_AS_OF = "2026-08-01" as const;
const PRICE_SOURCE = "https://openrouter.ai/api/v1/models" as const;

const MODEL_PRICES: Readonly<Record<string, IModelPrice>> = {
  "gpt-5.6-luna": {
    short: {
      input: 0.1,
      cachedInput: 0.01,
      cacheWriteInput: 0.125,
      output: 0.6,
    },
    long: {
      input: 0.2,
      cachedInput: 0.02,
      cacheWriteInput: 0.25,
      output: 0.9,
    },
  },
  "gpt-5.6-terra": {
    short: {
      input: 1,
      cachedInput: 0.1,
      cacheWriteInput: 1.25,
      output: 6,
    },
    long: {
      input: 2,
      cachedInput: 0.2,
      cacheWriteInput: 2.5,
      output: 9,
    },
  },
  "gpt-5.6-sol": {
    short: {
      input: 5,
      cachedInput: 0.5,
      cacheWriteInput: 6.25,
      output: 30,
    },
    long: {
      input: 10,
      cachedInput: 1,
      cacheWriteInput: 12.5,
      output: 45,
    },
  },
};

export const collectEvidenceBenchmarkApiCost = (
  props: ITtscEvidenceBenchmarkApiCostProps,
): ITtscEvidenceBenchmarkApiCost | null => {
  const prices: IModelPrice | undefined =
    MODEL_PRICES[props.model.toLowerCase()];
  if (prices === undefined) return null;
  const stageLogs: string[] = props.stageLogs.filter((file) =>
    fs.existsSync(file),
  );
  if (stageLogs.length === 0)
    return unavailable(props, "native stage logs are missing");

  let observed: ITtscEvidenceBenchmarkTokenUsage = structuredClone(
    props.initial ?? emptyUsage(),
  );
  let amountUsd: number = 0;
  let requests: number = 0;
  let shortContextRequests: number = 0;
  let longContextRequests: number = 0;
  let replayedUpdates: number = 0;
  let invalid: string | undefined;
  let reachedExpected: boolean = sameUsage(observed, props.expected);
  forEachLine(stageLogs, (line) => {
    if (invalid !== undefined || reachedExpected) return;
    if (!line.includes('"method":"thread/tokenUsage/updated"')) return;
    const update: ITokenUsageUpdate | null = readUsageUpdate(line);
    if (update === null) return;
    // Context compaction can emit `last.totalTokens` without advancing any
    // cumulative counter. It is not part of the retained usage being priced.
    if (sameUsage(update.total, observed)) return;
    const usage: ITtscEvidenceBenchmarkTokenUsage | null = subtractUsage(
      update.total,
      observed,
    );
    if (usage === null || !sameUsage(usage, update.last)) {
      // Two drivers on one thread write two cumulative counters into one
      // stream, so a line can report a total this walk has already passed or
      // one whose step does not match the request it carries. Such a line
      // states no request of its own, and abandoning the run over it discards
      // a measurement the surviving sequence still holds. Drop it and count
      // the drop; the reconciliation below is what decides whether what
      // survived is the whole run.
      replayedUpdates += 1;
      return;
    }
    const validation: string | undefined = validateUsage(usage);
    if (validation !== undefined) {
      invalid = validation;
      return;
    }
    observed = update.total;
    reachedExpected = sameUsage(observed, props.expected);
    const long: boolean = usage.inputTokens >= LONG_CONTEXT_THRESHOLD_TOKENS;
    const price: ITokenPrice = long ? prices.long : prices.short;
    amountUsd += calculateRequestCost(usage, price);
    requests += 1;
    if (long) longContextRequests += 1;
    else shortContextRequests += 1;
  });
  if (invalid !== undefined)
    return unavailable(props, `${invalid} in ${stageLogs.join(", ")}`);
  if (!sameUsage(observed, props.expected))
    return unavailable(
      props,
      `per-request usage ${JSON.stringify(observed)} does not match retained usage ${JSON.stringify(props.expected)}`,
    );
  return {
    provider: "openrouter",
    pricingAsOf: PRICING_AS_OF,
    priceSource: PRICE_SOURCE,
    currency: "USD",
    amountUsd: Math.round(amountUsd * 100_000_000) / 100_000_000,
    requests,
    shortContextRequests,
    longContextRequests,
    longContextThresholdTokens: LONG_CONTEXT_THRESHOLD_TOKENS,
    replayedUpdates,
  };
};

const unavailable = (
  props: ITtscEvidenceBenchmarkApiCostProps,
  reason: string,
): null => {
  if (props.strict)
    throw new Error(`Cannot calculate exact API cost: ${reason}.`);
  return null;
};

const calculateRequestCost = (
  usage: ITtscEvidenceBenchmarkTokenUsage,
  price: ITokenPrice,
): number => {
  const uncachedInputTokens: number =
    usage.inputTokens - usage.cachedInputTokens - usage.cacheWriteInputTokens;
  return (
    (uncachedInputTokens * price.input +
      usage.cachedInputTokens * price.cachedInput +
      usage.cacheWriteInputTokens * price.cacheWriteInput +
      usage.outputTokens * price.output) /
    1_000_000
  );
};

const readUsageUpdate = (line: string): ITokenUsageUpdate | null => {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (!isRecord(value) || !isRecord(value.params)) return null;
  const tokenUsage: unknown = value.params.tokenUsage;
  if (
    !isRecord(tokenUsage) ||
    !isRecord(tokenUsage.total) ||
    !isRecord(tokenUsage.last)
  )
    return null;
  const total: ITtscEvidenceBenchmarkTokenUsage | null = readUsage(
    tokenUsage.total,
  );
  const last: ITtscEvidenceBenchmarkTokenUsage | null = readUsage(
    tokenUsage.last,
  );
  return total === null || last === null ? null : { total, last };
};

const readUsage = (
  value: Record<string, unknown>,
): ITtscEvidenceBenchmarkTokenUsage | null => {
  const keys: readonly (keyof ITtscEvidenceBenchmarkTokenUsage)[] = [
    "totalTokens",
    "inputTokens",
    "cachedInputTokens",
    "cacheWriteInputTokens",
    "outputTokens",
    "reasoningOutputTokens",
  ];
  if (
    keys.some(
      (key) =>
        typeof value[key] !== "number" ||
        !Number.isSafeInteger(value[key]) ||
        (value[key] as number) < 0,
    )
  )
    return null;
  return {
    totalTokens: value.totalTokens as number,
    inputTokens: value.inputTokens as number,
    cachedInputTokens: value.cachedInputTokens as number,
    cacheWriteInputTokens: value.cacheWriteInputTokens as number,
    outputTokens: value.outputTokens as number,
    reasoningOutputTokens: value.reasoningOutputTokens as number,
  };
};

const validateUsage = (
  usage: ITtscEvidenceBenchmarkTokenUsage,
): string | undefined => {
  if (usage.totalTokens !== usage.inputTokens + usage.outputTokens)
    return "a per-request token total is invalid";
  if (usage.cachedInputTokens + usage.cacheWriteInputTokens > usage.inputTokens)
    return "per-request input-token subsets are invalid";
  if (usage.reasoningOutputTokens > usage.outputTokens)
    return "a per-request reasoning-token subset is invalid";
  return undefined;
};

/**
 * Reads ordered stage logs as one continuous line stream.
 *
 * The remainder carries across files on purpose. The runner routes each stream
 * chunk to the stage that owned the thread when it arrived, and a chunk can end
 * mid-line, so the last line of one stage log and the first line of the next
 * are frequently two halves of the same JSON message.
 */
const forEachLine = (
  files: readonly string[],
  closure: (line: string) => void,
): void => {
  const buffer: Buffer = Buffer.alloc(4 * 1024 * 1024);
  let remainder: string = "";
  for (const file of files) {
    const descriptor: number = fs.openSync(file, "r");
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
          `${remainder}${buffer.subarray(0, length).toString("utf8")}`.split(
            "\n",
          );
        remainder = lines.pop()!;
        for (const line of lines) closure(line);
      }
    } finally {
      fs.closeSync(descriptor);
    }
  }
  if (remainder.length !== 0) closure(remainder);
};

const emptyUsage = (): ITtscEvidenceBenchmarkTokenUsage => ({
  totalTokens: 0,
  inputTokens: 0,
  cachedInputTokens: 0,
  cacheWriteInputTokens: 0,
  outputTokens: 0,
  reasoningOutputTokens: 0,
});

const subtractUsage = (
  current: ITtscEvidenceBenchmarkTokenUsage,
  previous: ITtscEvidenceBenchmarkTokenUsage,
): ITtscEvidenceBenchmarkTokenUsage | null => {
  const difference: ITtscEvidenceBenchmarkTokenUsage = {
    totalTokens: current.totalTokens - previous.totalTokens,
    inputTokens: current.inputTokens - previous.inputTokens,
    cachedInputTokens: current.cachedInputTokens - previous.cachedInputTokens,
    cacheWriteInputTokens:
      current.cacheWriteInputTokens - previous.cacheWriteInputTokens,
    outputTokens: current.outputTokens - previous.outputTokens,
    reasoningOutputTokens:
      current.reasoningOutputTokens - previous.reasoningOutputTokens,
  };
  return Object.values(difference).some((value) => value < 0)
    ? null
    : difference;
};

const sameUsage = (
  left: ITtscEvidenceBenchmarkTokenUsage,
  right: ITtscEvidenceBenchmarkTokenUsage,
): boolean =>
  left.totalTokens === right.totalTokens &&
  left.inputTokens === right.inputTokens &&
  left.cachedInputTokens === right.cachedInputTokens &&
  left.cacheWriteInputTokens === right.cacheWriteInputTokens &&
  left.outputTokens === right.outputTokens &&
  left.reasoningOutputTokens === right.reasoningOutputTokens;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
