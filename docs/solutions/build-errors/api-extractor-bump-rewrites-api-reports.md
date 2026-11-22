---
title: "An api-extractor bump fails every package build until the API reports are regenerated"
date: 2026-11-22
category: build-errors
module: npm-package
problem_type: build_error
component: tooling
symptoms:
  - "A dependency-bump PR fails `pnpm run build` in a few packages with `[ELIFECYCLE] Command failed with exit code 1`"
  - "The log above it reads `You have changed the API signature for this project. Please copy the file temp/<name>.api.md to etc/<name>.api.md`"
root_cause: config_error
resolution_type: config_change
severity: low
tags:
  - api-extractor
  - api-report
  - dependabot
---

# An api-extractor bump fails every package build until the API reports are regenerated

## Problem

`build` runs `tsdown && pnpm api:check`, and `api:check` runs api-extractor in CI mode. CI mode fails when the generated report differs from the committed `etc/<name>.api.md`. api-extractor 7.59 to 7.60 renames import aliases in the report (`Kind$1` became `Kind`, `Effect$1` became `Effect_2`, and so on). The public API did not move; only the report text did. Every package whose report contains such an alias fails to build.

## Fix

In each failing package run `pnpm run api:update` (`api-extractor run --local`) after `tsdown`, and commit the changed reports. Review the diff: it must be alias renames only. Because the packages' build hash changed, add an intent with `pnpm change` (REPO-R2).

## Prevention

Take an api-extractor bump together with regenerated reports. Never loosen `api:check`.

## Second failure in the same bump: `@opentelemetry/api` 1.10 widened `AttributeValue`

1.10.0 defines `AttributeValue` as a deprecated alias of `AnyValue`, and `AnyValue` is `unknown`. In `trace-spec`, `OtelAttributeValue | undefined` then became `unknown | undefined`, and oxlint's `no-redundant-type-constituents` failed the package lint. Fix the cause in the code, not in the lint config: take the value as `OtelAttributeValue`, narrow it with `Array.isArray` and the `isScalar` guard, and keep the `?? []` default so an `undefined` attribute still yields an empty array. Do not spell the parameter `unknown`; `ban-unknown` rejects it.
