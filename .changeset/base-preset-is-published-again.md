---
'@systemfsoftware/stryker-js-cli': patch
"@systemfsoftware/stryker-js-engine": minor
---

The shared base preset is importable again at `./config/base`, so a config file can inherit it with `"extends"` instead of restating every setting. The entry had stopped being published, which silently broke any config that inherited from it.

The command manifest now lists the entry points the installed package actually declares, rather than a list written by hand that could disagree with it.
