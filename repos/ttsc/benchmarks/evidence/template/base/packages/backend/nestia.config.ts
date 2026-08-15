import type { INestiaConfig } from "@nestia/sdk";

export default {
  input: ["src/controllers"],
  output: "../api/src",
  swagger: {
    output: "../api/swagger.json",
    beautify: true,
    security: {
      bearer: {
        type: "http",
        scheme: "bearer",
      },
    },
  },
  simulate: true,
} satisfies INestiaConfig;
