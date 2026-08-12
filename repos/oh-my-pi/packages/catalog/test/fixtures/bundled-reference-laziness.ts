import { ollamaCloudModelManagerOptions } from "../../src/provider-models/ollama";
import { nanoGptModelManagerOptions } from "../../src/provider-models/openai-compat";

Bun.gc(true);
const rssBefore = process.memoryUsage().rss;
nanoGptModelManagerOptions();
ollamaCloudModelManagerOptions();
Bun.gc(true);
const retainedRssBytes = process.memoryUsage().rss - rssBefore;

const result = JSON.stringify({ retainedRssBytes });
const resultPath = process.env.OMP_CATALOG_LAZINESS_RESULT_PATH;
if (resultPath) {
	await Bun.write(resultPath, result);
} else {
	process.stdout.write(result);
}
