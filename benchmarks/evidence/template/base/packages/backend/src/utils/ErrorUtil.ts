import type { IDiagnosis } from "{{apiPackageName}}";
import { HttpException, type HttpExceptionOptions } from "@nestjs/common";

/** Creates consistently shaped HTTP exceptions. */
export namespace ErrorUtil {
  /** Creates a 400 Bad Request exception. */
  export const badRequest = http(400);

  /** Creates a 401 Unauthorized exception. */
  export const unauthorized = http(401);

  /** Creates a 402 Payment Required exception. */
  export const paymentRequired = http(402);

  /** Creates a 403 Forbidden exception. */
  export const forbidden = http(403);

  /** Creates a 404 Not Found exception. */
  export const notFound = http(404);

  /** Creates a 409 Conflict exception. */
  export const conflict = http(409);

  /** Creates a 410 Gone exception. */
  export const gone = http(410);

  /** Creates a 422 Unprocessable Entity exception. */
  export const unprocessable = http(422);

  /** Creates a 500 Internal Server Error exception. */
  export const internal = http(500);

  function http(status: number) {
    return (
      reason: string | IDiagnosis | IDiagnosis[],
      options?: HttpExceptionOptions,
    ): HttpException => {
      const diagnoses: IDiagnosis[] =
        typeof reason === "string"
          ? [{ message: reason, accessor: "" }]
          : Array.isArray(reason)
            ? reason
            : [reason];
      return new HttpException(diagnoses, status, options);
    };
  }
}
