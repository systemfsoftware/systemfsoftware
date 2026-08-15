/** Exact API-equivalent cost reconstructed from native per-request usage. */
export interface ITtscEvidenceBenchmarkApiCost {
  provider: "openrouter";
  pricingAsOf: "2026-08-01";
  priceSource: "https://openrouter.ai/api/v1/models";
  currency: "USD";
  amountUsd: number;
  requests: number;
  shortContextRequests: number;
  longContextRequests: number;
  longContextThresholdTokens: 272_000;
  /**
   * Cumulative updates dropped as another writer's replay of the same thread.
   *
   * Zero for a stream one driver wrote. Above zero, the walk still reconciled
   * to the retained thread usage exactly, so `amountUsd` is the whole run: the
   * price of a token does not depend on which request carried it. What the
   * drops cost is resolution. A request whose only record was dropped is priced
   * inside the next step rather than on its own, so `requests` and the two
   * context counters are a lower bound while the amount is not.
   */
  replayedUpdates: number;
}
