package evidence

import (
  "strings"
  "testing"
)

// prismaUnitIndex renders materialized units as `target=symbol` lines, ordered
// as materialization produced them, so a case can assert the whole set at once
// rather than one property at a time.
func prismaUnitIndex(units []*evidenceUnit) string {
  rendered := make([]string, 0, len(units))
  for _, unit := range units {
    rendered = append(rendered, unit.Target+"="+unit.Symbol)
  }
  return strings.Join(rendered, "\n")
}

/**
 * Verifies a parsed model becomes one model unit owning one unit per column and
 * per relation.
 *
 * The column/relation split is the whole reason this graph asks Prisma's parser
 * rather than reading the schema itself, so materialization must carry the
 * distinction through instead of flattening both into one member kind. The
 * parent links matter just as much: hierarchical acknowledgement is what lets a
 * single citation on a model discharge its members, and it works only if every
 * member records the model's unit ID rather than being inferred later from the
 * dotted target.
 *
 *  1. Materialize a model with a stored column and a relation field.
 *  2. Assert the three units, their symbols, and their targets.
 *  3. Assert both members name the model unit as their parent.
 */
func TestPrismaMaterializesModelColumnAndRelationUnits(t *testing.T) {
  units := prismaModelUnits(prismaModel{
    Name: "Sale",
    Fields: []prismaField{
      {Name: "price", Symbol: "column"},
      {Name: "seller", Symbol: "relation"},
    },
  })
  want := "prisma:Sale=model\nprisma:Sale.price=column\nprisma:Sale.seller=relation"
  if got := prismaUnitIndex(units); got != want {
    t.Fatalf("materialized units:\n%s\nwant:\n%s", got, want)
  }
  for _, unit := range units[1:] {
    if unit.ParentID != "prisma:Sale" {
      t.Fatalf("member %q must belong to the model unit, got parent %q", unit.Target, unit.ParentID)
    }
  }
  if units[0].ParentID != "" {
    t.Fatalf("a model is a root unit, got parent %q", units[0].ParentID)
  }
}

/**
 * Verifies both sides of a self-relation stay two units on the one model that
 * declares them.
 *
 * Prisma names a relation once and attaches that name to both of its fields, so
 * a materializer that keyed on the relation name would fold `parent` and
 * `children` into a single unit. On a self-relation both sides belong to the
 * same model, so the fold would look locally consistent while silently halving
 * the obligations a relation-selecting reference owes — and no diagnostic would
 * ever mention the side that disappeared.
 *
 *  1. Materialize a model carrying both sides of one named self-relation.
 *  2. Assert both relation fields survive as their own units.
 *  3. Assert each addresses the field it was written as.
 */
func TestPrismaKeepsBothSidesOfASelfRelation(t *testing.T) {
  units := prismaModelUnits(prismaModel{
    Name: "Node",
    Fields: []prismaField{
      {Name: "parent_id", Symbol: "column"},
      {Name: "parent", Symbol: "relation"},
      {Name: "children", Symbol: "relation"},
    },
  })
  want := "prisma:Node=model\nprisma:Node.parent_id=column\nprisma:Node.parent=relation\nprisma:Node.children=relation"
  if got := prismaUnitIndex(units); got != want {
    t.Fatalf("a shared relation name must not merge its two sides:\n%s\nwant:\n%s", got, want)
  }
}

/**
 * Verifies materialization admits only the two member kinds this graph
 * addresses, and never the same address twice.
 *
 * Both guards protect the coverage denominator from the process boundary. A
 * member kind this graph does not know would become a unit whose symbol no
 * selector can ever select — an obligation that cannot be acknowledged and
 * therefore fails forever — while a repeated name would count one field as two
 * obligations, the second of which no citation can discharge separately.
 *
 *  1. Materialize a model carrying an unknown member kind and a repeated name.
 *  2. Assert the unknown kind contributes nothing.
 *  3. Assert the repeat collapses to the first occurrence.
 */
func TestPrismaAdmitsOnlyAddressableMembersOnce(t *testing.T) {
  units := prismaModelUnits(prismaModel{
    Name: "Sale",
    Fields: []prismaField{
      {Name: "price", Symbol: "column"},
      {Name: "sequence", Symbol: "index"},
      {Name: "price", Symbol: "relation"},
    },
  })
  want := "prisma:Sale=model\nprisma:Sale.price=column"
  if got := prismaUnitIndex(units); got != want {
    t.Fatalf("materialized units:\n%s\nwant:\n%s", got, want)
  }
}

/**
 * Verifies a member's identity stays segmented rather than pre-joined.
 *
 * The identity is what an address is rebuilt from, and the locator keys on the
 * same segments. Storing `Sale.price` as one segment would read identically
 * today and quietly lose the boundary the moment anything has to tell a model
 * name from a member name — the same failure the TypeScript side keeps
 * segmented identities to avoid.
 *
 *  1. Materialize a model with one column.
 *  2. Assert the model identity holds one segment and the column two.
 */
func TestPrismaMemberIdentityKeepsItsSegments(t *testing.T) {
  units := prismaModelUnits(prismaModel{
    Name:   "Sale",
    Fields: []prismaField{{Name: "price", Symbol: "column"}},
  })
  if len(units[0].Identity) != 1 || units[0].Identity[0] != "Sale" {
    t.Fatalf("model identity: %#v", units[0].Identity)
  }
  if len(units[1].Identity) != 2 ||
    units[1].Identity[0] != "Sale" ||
    units[1].Identity[1] != "price" {
    t.Fatalf("column identity: %#v", units[1].Identity)
  }
  if joinPrismaIdentity(units[1].Identity) != "Sale.price" {
    t.Fatalf("locator key: %q", joinPrismaIdentity(units[1].Identity))
  }
}
