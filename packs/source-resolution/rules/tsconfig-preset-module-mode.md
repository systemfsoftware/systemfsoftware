# tsconfig preset: a module mode that honours conditions, and no cleared condition

Every in-tree tsconfig preset a project extends must resolve a NodeNext, Node16,
Bundler or preserve module mode through `module` or `moduleResolution`, and must
not clear the development source condition: a preset that names `customConditions`
must not empty it or name a different condition.

A preset without one of those module modes makes every condition inert: only a
resolver that honours export conditions consults them, so under a `node10`
module mode a project that names the condition still resolves published names
through `types` to `dist/`. The failure hides locally because a stale `dist/`
from an earlier build answers the import, and shows up only on a clean checkout.
A preset that clears `customConditions` (`[]`) overrides the condition a project
or another extended preset set, with the same effect.

Fix it in the preset: set `module` to `NodeNext`, `Node16` or `preserve`, or
`moduleResolution` to `Bundler`, `Node16` or `NodeNext`, and either name the
condition in `customConditions` or leave the key out so the project's own value
stands.

```grit
language json
multifile {
  file($name, $body) where {
    $name <: r".*/tsconfig/.*\.json",
    $name <: presetFiles(),
    or {
      $program <: and {
        not contains `"module": $mode` where {
          $mode <: r"\"(?:[Nn]odeNext|[Nn]ode16|[Pp]reserve)\""
        },
        not contains `"moduleResolution": $resolution` where {
          $resolution <: r"\"(?:[Bb]undler|[Nn]ode16|[Nn]odeNext)\""
        }
      },
      $program <: contains `"customConditions": []`,
      $program <: contains `"customConditions": [$cond, $...]` where {
        $cond <: not condition()
      }
    }
  }
}
```
