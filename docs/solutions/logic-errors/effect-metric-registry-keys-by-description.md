---
module: effect-cell-types
date: 2026-09-21
problem_type: logic_error
component: tooling
severity: high
symptoms:
  - "A histogram updated under app.order.submit.duration reads back as count 0 from a second instrument with the same name and label"
  - "Two cells that share an operation name do not share one duration series"
root_cause: wrong_api
resolution_type: code_fix
tags:
  - effect
  - metrics
  - opentelemetry
---

# Effect keys a metric by description as well as name

## Problem

`Sandwich.named` recorded duration on `app.<operation>.duration`, then a read of that same name and `result_class` label returned count 0. The runner was updating. The reader was looking at a different registry entry.

## Root cause

Effect's metric registry key is `type:name:description:attributes`, not name plus labels. A histogram created with `description: "Execution duration for order.submit"` and one created with no description are two instruments, even when the name and the `result_class` label match. The first registered description also wins for collectors that key only on the name, so a caller-supplied description forks the series.

Verified against `effect@4.0.0-rc.116` by providing `Metric.MetricRegistry` as a `Map` and printing its keys after `Sandwich.named('order.submit')` ran.

## Solution

The runner creates the histogram with boundaries only. It does not set a description. Two cells that share an operation name then share one registry entry, and a reader that builds `Metric.histogram('app.<operation>.duration', { boundaries })` sees the samples.

Do not add a description later to "document" the instrument. That string is part of the identity.

## Prevention

When a local `Metric.value` read misses an update you know ran, print the registry keys before changing the update call. A description mismatch looks like a dropped sample.
