---
title: Configuration gets no test and no gate
applies_when:
  - adding a test that asserts a configuration value, a default, a port, a URL, a timeout or a version
  - adding a CI job, check or deploy preflight that asserts a workflow's shape, a ruleset's or required-check list's contents, or an allowlist
  - adding a check that a credential, environment variable or Doppler secret is present
  - adding a test or script that mirrors src/config.ts, a workflow file or a config file
tags: [testing, configuration, gates, ci, preflight, doppler, secrets, workflows]
---

Never add a test, check, lint rule, CI job or deploy preflight that asserts configuration: a config value or default, an environment or Doppler variable's presence, a workflow's or ruleset's shape, a version pin, a required-check list or an allowlist. A missing or wrong configuration value fails at deploy on its own, and that is the check.

Owner ruling, 2026-10-30: "Stop adding gates and tests for what is nothing more than CONFIGURATION."

A test of behaviour is fine when it supplies settings and asserts what the consumer observes (configuration pack: tests-supply-settings-and-never-mirror-them.md). A test that restates the configuration is not.
