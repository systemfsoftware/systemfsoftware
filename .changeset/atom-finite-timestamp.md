---
'@systemfsoftware/effect-atom': patch
---

A serialised successful result now requires its timestamp to be a finite number.
It previously accepted `NaN` and `Infinity`, so a corrupted timestamp could decode
without complaint and reach code that compares it.
