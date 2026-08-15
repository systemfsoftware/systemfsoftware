import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";
import type { HttpException } from "@nestjs/common";

import { ErrorUtil } from "./ErrorUtil";

/** Translates known Prisma failures into public HTTP exceptions. */
export namespace PrismaErrorUtil {
  /** Maps one known Prisma request error to its HTTP representation. */
  export function from(error: PrismaClientKnownRequestError): HttpException {
    switch (error.code) {
      case "P2025":
        return ErrorUtil.notFound("The requested resource was not found.", {
          cause: error,
        });
      case "P2002":
        return ErrorUtil.conflict(
          "The request conflicts with an existing resource.",
          { cause: error },
        );
      default:
        return ErrorUtil.internal("The request could not be completed.", {
          cause: error,
        });
    }
  }
}
