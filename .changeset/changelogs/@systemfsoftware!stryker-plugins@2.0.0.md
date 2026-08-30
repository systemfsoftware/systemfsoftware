## 2.0.0

### Major Changes

- Ignorer AST-node schemas now match the ESTree node names the oxc-based instrumenter emits: string literals are `Literal` nodes with a string `value` (no `StringLiteral` tag) and object properties are `Property` nodes (no `ObjectProperty` tag). Custom ignorers that declare Babel-style node shapes must retarget to these names.
