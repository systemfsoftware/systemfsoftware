# @systemfsoftware/oxlint-plugin-dmmf-workflow@8.1.0

decision-code-imports reads Effect 4 schema use: a workspace schema may be the receiver of .literal, .literals, .guards, .match and .cases, and of .annotate(...), .check(...) or .pipe(...) (pipe only through S.* combinators) whose result is read on as a schema; call arguments are still read. The command, decision and error fields of effect-cell-types Workflow.make, named or through a namespace import and through satisfies/as wrappers, are schema positions.
