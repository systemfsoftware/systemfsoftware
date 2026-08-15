import "source-map-support/register";

import { MyBackend } from "../MyBackend";

async function main(): Promise<void> {
  const backend = new MyBackend();
  await backend.open();

  const shutdown = (): void => {
    void backend
      .close()
      .then(() => process.exit(0))
      .catch((error: unknown) => {
        console.error(error);
        process.exit(1);
      });
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  process.on("uncaughtExceptionMonitor", console.error);
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
