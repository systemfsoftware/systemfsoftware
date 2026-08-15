---
"@systemfsoftware/stryker-plugins": minor
---

The schema-declaration ignorer now treats a `Schema.Class` identifier and a `Schema.brand` name as declaration data, exporting `CLASS_ID_IGNORED` and `BRAND_NAME_IGNORED` and suppressing those string arguments. It also exports `CLASS_FIELDS_IGNORED` for a Class fields object, but no rule emits it: ignoring the fields object would suppress the literals inside it, and a field's accepted value set is behaviour, not data.
