---
"@systemfsoftware/arethetypeswrong-core": major
---

`PackageSpecParseError` is a class you construct rather than a function you call.

Build one with `new PackageSpecParseError({ message })` where you previously called
`PackageSpecParseError(message)`. The tag and the `message` field are unchanged, and
`parsePackageSpec` still fails with it — code that only reads the failure needs no edit.
