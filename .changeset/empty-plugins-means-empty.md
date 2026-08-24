---
"@systemfsoftware/stryker-js-mutation-run": major
---

`"plugins": []` in a config that extends another now means no plugins.

`plugins` was the one array that appended to the inherited value instead of
replacing it, so writing the empty array read as "add nothing" and every plugin
the base config named still loaded. There was no way to extend a preset and
decline its plugins, and a preset naming a plugin your project cannot resolve
failed the run with nothing you could write to stop it.

Arrays now replace wholesale, `plugins` included, matching every other array in
the option set. A config that extends a preset and does not mention `plugins`
still inherits the preset's list unchanged; a config that names `plugins` gets
exactly the list it names. If you were relying on the append to add to an
inherited set, name the whole set you want.
