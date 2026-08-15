import fs from "node:fs";
import path from "node:path";

/**
 * Creates the backend's local environment file from the example it ships.
 *
 * This is the one setup step the template asks of a cell rather than of the
 * runner: `.agents/skills/backend/SKILL.md` prescribes `cp .env.example .env`
 * before tests or server startup, and `.gitignore` keeps the result out of the
 * baseline. Doing it here is doing what a launched cell does, not working
 * around a gap — `MyGlobal` validates the loaded values and refuses to start
 * without them.
 */
export const provisionEnvironment = (workspace: string): void => {
  const backend: string = path.join(workspace, "packages", "backend");
  const example: string = path.join(backend, ".env.example");
  const environment: string = path.join(backend, ".env");
  if (!fs.existsSync(example))
    throw new Error(
      `${example} is missing, so the backend has no environment to start from.`,
    );
  fs.copyFileSync(example, environment);
};
