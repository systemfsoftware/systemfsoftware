import { MyGlobal } from "../MyGlobal";
import { MySetupWizard } from "../setup/MySetupWizard";

const main = async (): Promise<void> => {
  MyGlobal.testing = true;
  await MySetupWizard.schema();
};

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
