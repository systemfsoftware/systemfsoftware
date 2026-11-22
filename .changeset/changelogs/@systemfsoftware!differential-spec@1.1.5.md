# @systemfsoftware/differential-spec@1.1.5

A check that declares hostBound now runs: each generated input runs once on Effect's own runtime, so a target that reaches a real file, socket or timer is compared instead of failing as Blocked or Escape. fast-check still shrinks a failing input, and the report names the host-bound reason in place of a schedule.

stryker-config's optional `@systemfsoftware/stryker-js` peer now accepts any version from 17.0.0 on, including the 22.x tree Stryker's flake package links. trace-spec and differential-spec run Stryker from that flake package and name its plugins by bare name; nothing they publish changes.
