package evidence

// recordPopulationFailure preserves a loader failure that belongs to a whole
// population rather than to one file.
//
// A synthetic inventory keeps the existing loader boundary intact: callers
// still receive the inventories and diagnostics they asked for, while graph
// materialization can tell "matched nothing" from "could not inspect enough to
// know what matched". Its NUL-prefixed key cannot be produced by a normalized
// artifact address and matchingInventoryPaths rejects it through relativeOf.
func recordPopulationFailure(
  inventories map[string]*artifactInventory,
  kind artifactKind,
  base populationBase,
) {
  if inventories == nil || base.Absolute == "" {
    return
  }
  key := "\x00load-failure:" + string(kind) + ":" + base.Absolute
  inventories[key] = &artifactInventory{
    Type:        kind,
    LoadFailed:  true,
    FailureBase: base.Absolute,
  }
}

func populationIsHealthy(
  inventories map[string]*artifactInventory,
  base populationBase,
  paths []string,
) bool {
  for _, inventory := range inventories {
    if inventory != nil &&
      inventory.LoadFailed &&
      inventory.FailureBase == base.Absolute {
      return false
    }
  }
  for _, path := range paths {
    if inventory := inventories[path]; inventory != nil && inventory.LoadFailed {
      return false
    }
  }
  return true
}
