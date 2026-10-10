# A service module declares a port, never a Layer

A `*.service.ts` module in this directory builds or exports a `Layer`: a
`Layer.*` call, a class field named `layer` or `*Layer`, a `*Live` export, a
re-export of `layer`, `*Layer` or `*Live`, or an export bound to one. The
finding names the directory's first service module; search every `*.service.ts`
in the directory. Next: move the Layer to `src/drivers/<what-it-binds>.ts` as
`layer`, delete its export from the service module, and import the driver at
the composition root.

```grit
language js
multifile {
  file($name, $body) where {
    $name <: r".*\.service\.ts",
    $body <: contains or {
      `Layer.$method($...)`,
      `export const $live = $_` where { $live <: r".*Live" },
      `export const $_ = $bound` where {
        $bound <: or {
          identifier() as $id where { $id <: r"(?:layer|[A-Za-z0-9_$]*Layer|[A-Za-z0-9_$]*Live)" },
          member_expression(property=$member) where { $member <: r"(?:layer|[A-Za-z0-9_$]*Layer|[A-Za-z0-9_$]*Live)" }
        }
      },
      export_specifier(name=$exported) where { $exported <: r"(?:layer|[A-Za-z0-9_$]*Layer|[A-Za-z0-9_$]*Live)" },
      public_field_definition(name=$field) where { $field <: r"(?:layer|[A-Za-z]*Layer)" }
    }
  }
}
```

## Why

A Layer beside its tag means importing the contract imports the implementation
and everything the implementation reaches, so a consumer cannot take the port
without its driver, and a package cannot publish contracts without their
implementations. A re-export or an alias of a driver's Layer brings the driver
back into the contract's import graph just as a Layer built in place does.
