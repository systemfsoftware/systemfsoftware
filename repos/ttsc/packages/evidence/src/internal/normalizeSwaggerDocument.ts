import type { OpenApi } from "@typia/interface";
import { OpenApiConverter } from "@typia/utils";

/** @internal */
export const normalizeSwaggerDocument = (input: any): OpenApi.IDocument =>
  OpenApiConverter.upgradeDocument(input);
