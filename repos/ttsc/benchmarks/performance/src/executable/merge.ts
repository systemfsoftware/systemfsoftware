#!/usr/bin/env node

import { TtscBenchmarkPerformanceWebsiteMerger } from "../TtscBenchmarkPerformanceWebsiteMerger.ts";

await TtscBenchmarkPerformanceWebsiteMerger.main(process.argv.slice(2));
