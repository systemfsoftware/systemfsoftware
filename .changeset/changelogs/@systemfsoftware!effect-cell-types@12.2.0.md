# @systemfsoftware/effect-cell-types@12.2.0

Add `Sandwich.writer(name, options?)(read).decode(Command).write({ Decoded, CommandRejected })`, a cell that reads and writes and decides nothing. It decodes what `read` returns with `Command` and keeps the cell span, the `<name>.read` and `<name>.write` child spans, the command's declared attributes and the `app.<name>.duration` histogram with its `result_class`. It records no decision attribute and no decide stacktrace, and its `phases` are `['read', 'decode', 'write']`. Use it where an operation only lays out what it read, instead of inventing a decision whose tags differ only in presentation. `Sandwich.named` is unchanged.

Lints with the updated sandwich-shell-is-straight-line fix text; nothing published changes.
