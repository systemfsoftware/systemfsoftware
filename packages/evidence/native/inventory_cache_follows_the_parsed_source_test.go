package evidence

import (
  "testing"

  shimast "github.com/microsoft/typescript-go/shim/ast"
  shimcore "github.com/microsoft/typescript-go/shim/core"
  shimparser "github.com/microsoft/typescript-go/shim/parser"
)

func parseTestSource(t *testing.T, name string, content string) *shimast.SourceFile {
  t.Helper()
  file := shimparser.ParseSourceFile(
    shimast.SourceFileParseOptions{FileName: name},
    content,
    shimcore.ScriptKindTS,
  )
  if file == nil {
    t.Fatalf("the parser returned no source file for %s", name)
  }
  return file
}

/**
 * Verifies a cached scan is bound to the exact parsed source it came from.
 *
 * The cache exists because a watch cycle rescans thousands of files the edit
 * never touched, and it is safe only because the compiler hands back a new
 * source object for a file it reparsed. Serving a scan for content the host no
 * longer holds would report the previous edit's graph — a stale answer that
 * reads exactly like a correct one.
 *
 *  1. Scan one parsed source twice and assert the second scan is the first.
 *  2. Reparse the same path with different content.
 *  3. Assert the new source is scanned afresh and materializes the new unit.
 */
func TestInventoryCacheFollowsTheParsedSource(t *testing.T) {
  cache := newTypeScriptInventoryCache()
  address := populationBase{}.addressOf("src/contracts.ts")
  before := parseTestSource(t, "/repo/src/contracts.ts", "export interface IBefore {}\n")

  first := cache.scan(address, before)
  if first == nil || len(first.Units) != 1 || first.Units[0].Target != "IBefore" {
    t.Fatalf("the first scan did not materialize the declared unit: %+v", first)
  }
  if again := cache.scan(address, before); again != first {
    t.Fatal("the same parsed source was scanned twice instead of being reused")
  }

  after := parseTestSource(t, "/repo/src/contracts.ts", "export interface IAfter {}\n")
  edited := cache.scan(address, after)
  if edited == first {
    t.Fatal("an edited source was served the previous scan")
  }
  if len(edited.Units) != 1 || edited.Units[0].Target != "IAfter" {
    t.Fatalf("the edited source did not materialize its new unit: %+v", edited)
  }
}

/**
 * Verifies the cache keeps two generations and no more.
 *
 * A resident editor session rebuilds the graph after every keystroke, so an
 * entry that is never retired would grow the process by one scan per edit for
 * as long as the session lives. Two generations keep a hit across one
 * intervening rebuild, which is what a cycle that touches a different project
 * needs, and bound the memory at twice the file set.
 *
 *  1. Scan one source and retire the generation it landed in once.
 *  2. Assert it still hits.
 *  3. Retire twice with no hit and assert it is scanned afresh.
 */
func TestInventoryCacheKeepsTwoGenerations(t *testing.T) {
  cache := newTypeScriptInventoryCache()
  address := populationBase{}.addressOf("src/contracts.ts")
  file := parseTestSource(t, "/repo/src/contracts.ts", "export interface IContract {}\n")

  first := cache.scan(address, file)
  cache.beginCycle()
  if survived := cache.scan(address, file); survived != first {
    t.Fatal("one retirement dropped an entry the next cycle still needed")
  }

  cache.beginCycle()
  cache.beginCycle()
  if dropped := cache.scan(address, file); dropped == first {
    t.Fatal("an entry survived two retirements without a hit")
  }
}

/**
 * Verifies one file addressed through two roots keeps two scans.
 *
 * A unit identity carries the address it was materialized under, so the same
 * physical file selected by two differently rooted populations is two
 * inventories. Keying the cache by the source alone would hand the second
 * population the first one's addresses.
 *
 *  1. Scan one parsed source under two addresses.
 *  2. Assert the two scans are distinct.
 *  3. Assert each keeps its own address.
 */
func TestInventoryCacheSeparatesAddressesOfOneSource(t *testing.T) {
  cache := newTypeScriptInventoryCache()
  file := parseTestSource(t, "/repo/src/contracts.ts", "export interface IContract {}\n")

  local := cache.scan(populationBase{}.addressOf("src/contracts.ts"), file)
  rooted := cache.scan(
    populationBase{Absolute: "/repo/api", Display: "../api"}.addressOf("src/contracts.ts"),
    file,
  )
  if local == rooted {
    t.Fatal("two addresses of one source shared a scan")
  }
  if local.Address == rooted.Address {
    t.Fatalf("both scans kept the same address %q", local.Address)
  }
}
