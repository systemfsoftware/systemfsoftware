import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/sdk";
import dotenv from "dotenv";
import dotenvExpand from "dotenv-expand";
import { Singleton } from "tstl";
import typia, { tags } from "typia";

import { MyConfiguration } from "./MyConfiguration";

/** Provides validated process state shared by backend providers. */
export class MyGlobal {
  /** Allows destructive schema setup only in an explicit setup process. */
  public static testing: boolean = false;

  /** Returns the validated runtime environment. */
  public static get env(): MyGlobal.IEnvironments {
    return environments.get();
  }

  /** Returns the singleton Prisma client. */
  public static get prisma(): PrismaClient {
    return prisma.get();
  }
}

/** Public contracts for global backend state. */
export namespace MyGlobal {
  /** Environment values required by the backend process. */
  export interface IEnvironments {
    /** HTTP port accepted by the Nest listener. */
    API_PORT: `${number}`;

    /** Secret used to sign authentication tokens. */
    JWT_SECRET_KEY: string & tags.MinLength<32>;

    /** Lifetime of an access token in seconds. */
    JWT_ACCESS_TTL_SECONDS: string & tags.Pattern<"^[1-9][0-9]*$">;

    /** Lifetime of a refresh token in seconds. */
    JWT_REFRESH_TTL_SECONDS: string & tags.Pattern<"^[1-9][0-9]*$">;
  }
}

const environments = new Singleton(() => {
  const loaded = dotenv.config();
  dotenvExpand.expand(loaded);
  const validated = typia.assert<MyGlobal.IEnvironments>(
    process.env,
    (props) =>
      new Error(
        `Invalid environment ${props.path}: expected ${props.expected}.`,
      ),
  );
  if (
    BigInt(validated.JWT_REFRESH_TTL_SECONDS) <=
    BigInt(validated.JWT_ACCESS_TTL_SECONDS)
  )
    throw new Error(
      "Invalid environment: JWT_REFRESH_TTL_SECONDS must exceed JWT_ACCESS_TTL_SECONDS.",
    );
  return validated;
});

const prisma = new Singleton(
  () =>
    new PrismaClient({
      adapter: new PrismaBetterSqlite3({
        url: `${MyConfiguration.ROOT}/prisma/db.sqlite`,
      }),
    }),
);
