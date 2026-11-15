# @systemfsoftware/stryker-config@0.2.2

stryker-config's optional `@systemfsoftware/stryker-js` peer now accepts any version from 17.0.0 on, including the 22.x tree Stryker's flake package links. trace-spec and differential-spec run Stryker from that flake package and name its plugins by bare name; nothing they publish changes.

The oxlint configs and plugins now require oxlint ~1.93.0 and oxlint-tsgolint 7.0.2006 (and @effect/tsgo ^0.69.0 where they depend on it). The other packages only build and lint with the new tools; what they publish is unchanged.
