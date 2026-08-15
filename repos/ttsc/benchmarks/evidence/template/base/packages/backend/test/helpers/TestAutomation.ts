import * as api from "{{apiPackageName}}";
import { DynamicExecutor } from "@nestia/e2e";

import { MyConfiguration } from "../../src/MyConfiguration";

/** Runs dynamically discovered backend feature tests against a live server. */
export namespace TestAutomation {
  /** Backend lifecycle operations used by the dynamic test runner. */
  export interface IProps<T> {
    /** Starts the backend under test. */
    open(): Promise<T>;

    /** Stops the backend under test. */
    close(backend: T): Promise<void>;
  }

  /** Executes every exported feature test against the running backend. */
  export async function execute<T>(
    props: IProps<T>,
  ): Promise<DynamicExecutor.IReport> {
    const backend = await props.open();
    try {
      return await DynamicExecutor.validate({
        prefix: "test",
        location: `${__dirname}/../features`,
        parameters: () => [
          {
            host: `http://127.0.0.1:${MyConfiguration.API_PORT()}`,
          } satisfies api.IConnection,
        ],
        simultaneous: 1,
        extension: __filename.split(".").pop() ?? "ts",
      });
    } finally {
      await props.close(backend);
    }
  }
}
