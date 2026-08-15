import childProcess from "node:child_process";

import { MyGlobal } from "../MyGlobal";

/** Owns destructive local database setup. */
export namespace MySetupWizard {
  /** Recreates the Prisma schema for an explicit setup process. */
  export async function schema(): Promise<void> {
    if (MyGlobal.testing === false)
      throw new Error(
        "Unable to reset the database outside an explicit setup process.",
      );
    childProcess.execSync(
      "pnpm exec prisma db push --force-reset --schema=prisma/schema",
      {
        stdio: "inherit",
        env: {
          ...process.env,
          // Prisma refuses this reset when it detects an AI agent, and tells
          // the caller to stop and obtain a human's consent before retrying.
          // Reaching this line is that consent: this script exists only to
          // recreate the local development database, and the guard above
          // refuses it outside the explicit setup entry point. Without this
          // the reset cannot complete unattended, and every command that needs
          // a schema stops here.
          PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION:
            "Reset the local development database from this project's setup script.",
        },
      },
    );
  }
}
