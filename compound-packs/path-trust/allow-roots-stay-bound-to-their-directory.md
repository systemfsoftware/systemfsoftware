---
title: A directory allow-root that a checker canonicalizes stays bound to the intended directory in every evaluation and every running environment
applies_when:
  - declaring a directory authorization root (spawn cwd roots, session roots, workspace roots, mount roots) that a checker canonicalizes before comparing
  - choosing or changing the value of a parameter that feeds such a root
  - adding an evaluation, host or platform that renders a checker with such a root
  - changing a checker so it starts or stops resolving symlinks in its roots
tags: [path-trust, allow-list, realpath, symlink]
---

A checker that canonicalizes both the requested path and its roots compares resolved paths. What it authorizes is whatever directory each root resolves to, not the spelling the configuration declares. A root therefore has to stay bound to the intended directory, given who can rewrite the root or any of its ancestors. A canonical spelling helps, because no link in it can be swapped, but it is not enough on its own: if a user-writable process can replace one of its ancestors with a link, or mount another tree over it, the binding moves anyway. A bind mount is invisible to `realpath`: the resolved path stays the same while the directory behind it changes. An alias is not wrong on its own either: a link or mount that only an administrator can change, such as a system mount alias owned by root, keeps the binding as well as the target's path does.

Three failure modes:

- **An alias moves authorization.** Take `/home/alice/Projects -> /srv/code`. The checker resolves the link when it checks, so it admits whatever the link points at at that moment. Any process that can rewrite the link, which for a link in a home directory is any process running as that user, moves the allow-list to another tree without touching the configuration. It does not only widen it: the intended tree can drop out while an unintended one is admitted, and a review of the configuration sees neither.
- **The root is missing or unmounted.** The path exists where one evaluation runs and not where another does. Under a checker that refuses on a resolution error, nothing lies under the root and every request is refused. That fails closed only under the checker's actual error handling (a checker that falls back to the unresolved spelling, or skips the root, behaves differently) and only while nothing can create the path. If a user can create the missing directory or a link at that path, the root starts admitting whatever they put there.
- **A literal `~` is not a home directory.** `realpath` never expands `~`; the shell does. What a checker does with `"~/Projects"` depends on how it canonicalizes: a strict resolver (GNU `realpath`, Node `fs.realpathSync`) refuses it because no directory named `~` exists, a non-strict one (Python `os.path.realpath`) returns a path under the checker's working directory, so the root moves with the cwd, and a checker that calls `expanduser` first gets the home directory of whichever user it runs as. It is a separate bug from the alias case, and the fix is to expand the home directory where the value is built, not to rely on the checker.

An evaluation produces a configuration; a running environment has mounts. The same machine can be rendered by two evaluations (a NixOS system and a home-manager generation, or a container image and a host install) whose running environments mount different things, so one literal shared by both can be a real directory in one and an alias or a missing path in the other. A configuration that evaluates cleanly says nothing about the mounts it will run under.

An alias paired with a resolving checker reads as careful on both sides, so it survives review. A missing root that fails closed raises no alarm: its only symptom is refused requests on the environment nobody exercised.

## Rule

- Declare each root so it resolves to the intended directory in every running environment that renders it, and so that nothing able to rewrite the root or any of its ancestors, by link or by mount, sits below the trust level the allow-list protects. Prefer the canonical path; accept an alias only when every link or mount in its chain is owned and changeable by an administrator alone.
- **The value is per evaluation, not per machine.** Take it from a parameter, and give that parameter the intended directory in each evaluation that renders the checker. Decide each value from what that evaluation's running environment mounts and persists, not from another evaluation of the same machine.
- Expand home directories where the value is built. Never hand a checker a literal `~`.
- Keep canonicalizing the requested path. This rule is about the root side only: resolving the requested path is what stops `..` and link escapes.
- Resolving roots once at startup does not exempt a checker from this rule. It only changes when a rewritten link is picked up: the resolved root is still a path, not a handle, so whoever can replace that directory or mount over it still moves the authorization without a restart, and a rewritten alias takes effect on the next restart.

```nix
# WRONG: an alias in a user-writable home. The checker resolves it, so the
# authorized tree is wherever the link points now.
allowedRoots = [ "/home/alice/Projects" ];   # -> /srv/code

# WRONG: a literal tilde. realpath does not expand it.
allowedRoots = [ "~/Projects" ];

# WRONG: one literal for two evaluations. /data/work is mounted where the
# home-manager generation runs and absent under the NixOS system.
codingRoot = "/data/work";

# RIGHT: each evaluation's real directory, from a parameter each evaluation sets.
# Every ancestor of each value (/, /srv, /data) is owned by root and writable only by
# root, the leaf is a directory rather than a link, and only an administrator mounts it.
codingRoot =
  if isNixOS then
    "/srv/work"          # persisted directory on the NixOS system
  else
    "/data/work";        # the mount on the other host
```

Gate: `review`. For each declared root, the reviewer names:

- the checker that consumes it, whether that checker canonicalizes roots, and what it does when a root fails to resolve;
- every evaluation that renders it. Enumerate the outputs with `nix flake show`, which names the members only of outputs Nix has a schema for, such as `nixosConfigurations`. For an output it shows as `unknown`, such as `homeConfigurations`, list the members with `nix eval .#homeConfigurations --apply builtins.attrNames` (and the same for each such output). Add any entrypoint outside the flake's outputs, such as a separate evaluation file for a non-NixOS host;
- the value it takes in each of those evaluations, read with `nix eval` of the consuming option on each output, never from the source module that sets the parameter. Without Nix, read the rendered configuration file each environment actually loads;
- whether that value is bound to the intended directory where it runs. On NixOS, compare it against the same evaluation's `fileSystems` and persistence declarations. On any other host, first run `test -d <root>` there and report a missing root as a defect, because plain `realpath` exits 0 when only the last component is missing and `realpath -m` exits 0 for any path. Then run `realpath -e <root>`, check that the root itself is not a link (`test -L <root>` fails), check the owner and write permission of the root and each of its ancestors, and run `findmnt -T <root> -o SOURCE,TARGET` to see whether a mount, a bind mount included, puts another tree at that path.
