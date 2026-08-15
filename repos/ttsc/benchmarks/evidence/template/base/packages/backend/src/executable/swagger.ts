import express from "express";
import fs from "node:fs";
import path from "node:path";
import SwaggerUI from "swagger-ui-express";

import { MyConfiguration } from "../MyConfiguration";

const port = Number(process.env.SWAGGER_PORT ?? 37810);

async function main(): Promise<void> {
  const location = path.resolve(MyConfiguration.ROOT, "../api/swagger.json");
  if (fs.existsSync(location) === false)
    throw new Error(
      `No swagger.json exists at ${location}. Run the backend build:sdk command first.`,
    );

  const document = JSON.parse(
    await fs.promises.readFile(location, "utf8"),
  ) as Record<string, unknown>;
  const app = express();
  app.use("/api-docs", SwaggerUI.serve, SwaggerUI.setup(document));
  app.listen(port, "127.0.0.1");
  console.log(`Swagger UI: http://127.0.0.1:${port}/api-docs`);
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
