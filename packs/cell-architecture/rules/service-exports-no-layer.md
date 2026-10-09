# A service module declares a port, never a Layer

A `*.service.ts` module declares a `Context.Service` port: the tag, its shape,
and functions that reach the service through the tag. It builds no `Layer`: no
`Layer.*` call, no class field named `layer` or `*Layer`, and no `*Live` export.

A Layer beside its tag means importing the contract imports the
implementation and everything the implementation reaches, so a consumer cannot
take the port without its driver, and a package cannot publish contracts
without their implementations.

Fix it by moving the Layer into a driver module (`src/drivers/<what-it-binds>.ts`)
that imports the tag and exports `layer`, and by importing that driver at the
composition root.

```grit
language js
multifile {
  file($name, $body) where {
    $name <: r".*\.service\.ts",
    $body <: contains or {
      `Layer.$method($...)`,
      `export const $live = $_` where { $live <: r".*Live" },
      public_field_definition(name=$field) where { $field <: r"layer|[A-Za-z]*Layer" }
    }
  }
}
```
