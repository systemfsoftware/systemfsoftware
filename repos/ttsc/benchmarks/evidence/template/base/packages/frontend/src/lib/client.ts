import type { IConnection } from "@nestia/fetcher";

import { config } from "@/lib/config";

/** Shared generated-SDK connection for browser requests. */
export const apiConnection: IConnection = {
  host: config.apiHost,
  simulate: config.simulate,
};
