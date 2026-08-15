import { MyBackend } from "../src/MyBackend";
import { TestAutomation } from "./helpers/TestAutomation";

void TestAutomation.execute({
  open: async () => {
    const backend = new MyBackend();
    await backend.open();
    return backend;
  },
  close: (backend) => backend.close(),
}).then(
  (report) => {
    if (report.executions.some((execution) => execution.error !== null))
      process.exitCode = 1;
    console.log(
      `TEST_AUTOMATION_REPORT=${JSON.stringify({
        executions: report.executions.map((execution) => ({
          name: execution.name,
          value: execution.value,
          error: execution.error?.message ?? null,
          stack: execution.error?.stack ?? null,
        })),
      })}`,
    );
  },
  (error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  },
);
