# @systemfsoftware/effect-schema-vite@3.1.7

The generated law suite now covers every exported schema `@systemfsoftware/effect-schema-discovery` finds by type, including an unannotated curried `Schema.declareConstructor<T>()(...)` and a schema built by a local helper.

Each package depends on the corrected schema-law package through the workspace; nothing published in these packages changes.
