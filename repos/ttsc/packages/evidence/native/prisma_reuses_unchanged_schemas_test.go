package evidence

import (
  "os"
  "path/filepath"
  "testing"
)

func prismaDigestRoot(t *testing.T, files map[string]string) string {
  t.Helper()
  root := t.TempDir()
  for relative, content := range files {
    absolute := filepath.Join(root, filepath.FromSlash(relative))
    if err := os.MkdirAll(filepath.Dir(absolute), 0o755); err != nil {
      t.Fatal(err)
    }
    if err := os.WriteFile(absolute, []byte(content), 0o644); err != nil {
      t.Fatal(err)
    }
  }
  return root
}

/**
 * Verifies the set digest answers for the whole set rather than for any one
 * file.
 *
 * A schema folder is parsed as a unit, so reuse is only sound when the key
 * covers every input to that parse. Each of the three changes below leaves at
 * least one file byte-identical, and a key that hashed files independently or
 * ignored their paths would hit on a schema that no longer means what it did —
 * returning models that were deleted and omitting ones that were added, with
 * nothing red anywhere.
 *
 *  1. Digest a two-file set.
 *  2. Change one file's bytes, then add a file, then rename one.
 *  3. Assert every change produces a different key.
 */
func TestPrismaDigestCoversTheWholeSet(t *testing.T) {
  base := prismaDigestRoot(t, map[string]string{
    "prisma/a.prisma": "model A {\n  id String @id\n}\n",
    "prisma/b.prisma": "model B {\n  id String @id\n}\n",
  })
  original := prismaContentDigest(base, []string{"prisma/a.prisma", "prisma/b.prisma"})
  if original == "" {
    t.Fatal("a readable set must digest")
  }

  edited := prismaDigestRoot(t, map[string]string{
    "prisma/a.prisma": "model A {\n  id String @id\n  extra Int\n}\n",
    "prisma/b.prisma": "model B {\n  id String @id\n}\n",
  })
  if prismaContentDigest(edited, []string{"prisma/a.prisma", "prisma/b.prisma"}) == original {
    t.Fatal("editing one file of the set must change the key")
  }

  grown := prismaDigestRoot(t, map[string]string{
    "prisma/a.prisma": "model A {\n  id String @id\n}\n",
    "prisma/b.prisma": "model B {\n  id String @id\n}\n",
    "prisma/c.prisma": "model C {\n  id String @id\n}\n",
  })
  if prismaContentDigest(grown, []string{
    "prisma/a.prisma",
    "prisma/b.prisma",
    "prisma/c.prisma",
  }) == original {
    t.Fatal("adding a file to the set must change the key")
  }

  renamed := prismaDigestRoot(t, map[string]string{
    "prisma/a.prisma":     "model A {\n  id String @id\n}\n",
    "prisma/other.prisma": "model B {\n  id String @id\n}\n",
  })
  if prismaContentDigest(renamed, []string{"prisma/a.prisma", "prisma/other.prisma"}) == original {
    t.Fatal("moving a model between files must change the key")
  }
}

/**
 * Verifies identical bytes in identical order reproduce the same key.
 *
 * The other half of the same contract: a digest that varied across runs would
 * make every cycle a miss, which costs a process spawn per rebuild while every
 * result stays correct. Nothing would go red, and the feature would simply not
 * exist.
 *
 *  1. Digest one set twice from two separate roots holding the same bytes.
 *  2. Assert the keys agree.
 */
func TestPrismaDigestIsStableAcrossRoots(t *testing.T) {
  files := map[string]string{
    "prisma/a.prisma": "model A {\n  id String @id\n}\n",
    "prisma/b.prisma": "model B {\n  id String @id\n}\n",
  }
  sources := []string{"prisma/a.prisma", "prisma/b.prisma"}
  first := prismaContentDigest(prismaDigestRoot(t, files), sources)
  second := prismaContentDigest(prismaDigestRoot(t, files), sources)
  if first == "" || first != second {
    t.Fatalf("the same bytes must key the same: %q vs %q", first, second)
  }
}

/**
 * Verifies an unreadable file keeps the whole set out of the cache.
 *
 * A set is parsed together, so a partial key would describe a parse that never
 * happened. Keying on what could be read would let a set hit after its missing
 * file returns, answering with models parsed while that file was absent.
 *
 *  1. Digest a set naming a file that does not exist.
 *  2. Assert no key is produced.
 */
func TestPrismaDigestDeclinesAnUnreadableSet(t *testing.T) {
  root := prismaDigestRoot(t, map[string]string{
    "prisma/a.prisma": "model A {\n  id String @id\n}\n",
  })
  if prismaContentDigest(root, []string{"prisma/a.prisma", "prisma/absent.prisma"}) != "" {
    t.Fatal("a set with an unreadable member must not be cacheable")
  }
}

/**
 * Verifies a rejection is remembered as a rejection.
 *
 * A schema the parser refuses is one its author is midway through fixing, and
 * every unrelated save during that repair would otherwise pay a fresh process
 * start to be told the same thing. The danger is the opposite mistake: an
 * outcome remembered as an empty success would report a schema with no models,
 * whose every obligation is vacuously satisfied.
 *
 *  1. Store a rejected outcome.
 *  2. Read it back.
 *  3. Assert it is still a rejection carrying its reason.
 */
func TestPrismaCacheRemembersARejection(t *testing.T) {
  cache := newPrismaCache()
  cache.store("digest", prismaSetOutcome{
    Rejected: true,
    Problem:  "Error validating: ...",
  })
  outcome, hit := cache.lookup("digest")
  if !hit {
    t.Fatal("a stored outcome must be readable")
  }
  if !outcome.Rejected || outcome.Problem == "" {
    t.Fatalf("a rejection must survive the round trip: %+v", outcome)
  }
  if len(outcome.Models) != 0 {
    t.Fatal("a rejected set has no models")
  }
}

/**
 * Verifies a cached entry cannot be mutated through a later reader.
 *
 * Every reader builds units from the models it gets back, and a resident host
 * may hold several projects at once. Handing out the stored slice would let one
 * cycle's edits reach another cycle's answer, which is a corruption no
 * diagnostic could ever attribute to a cache.
 *
 *  1. Store an outcome and read it twice.
 *  2. Mutate the first copy's models and fields.
 *  3. Assert the second copy is untouched.
 */
func TestPrismaCacheHandsOutCopies(t *testing.T) {
  cache := newPrismaCache()
  cache.store("digest", prismaSetOutcome{
    Models: []prismaModel{{
      Name:   "Sale",
      Fields: []prismaField{{Name: "price", Symbol: "column"}},
    }},
  })
  first, _ := cache.lookup("digest")
  first.Models[0].Name = "Mutated"
  first.Models[0].Fields[0].Name = "mutated"
  second, _ := cache.lookup("digest")
  if second.Models[0].Name != "Sale" || second.Models[0].Fields[0].Name != "price" {
    t.Fatalf("a reader mutated the stored entry: %+v", second.Models[0])
  }
}

/**
 * Verifies an empty key never enters or leaves the cache.
 *
 * An empty digest is what an unreadable set produces, so admitting one would
 * give every unreadable set the same key — and the first such set's outcome
 * would then answer for every later one.
 *
 *  1. Store an outcome under an empty key.
 *  2. Assert it cannot be looked up.
 */
func TestPrismaCacheRejectsAnEmptyKey(t *testing.T) {
  cache := newPrismaCache()
  cache.store("", prismaSetOutcome{Models: []prismaModel{{Name: "Sale"}}})
  if _, hit := cache.lookup(""); hit {
    t.Fatal("an unreadable set must not share one cache entry with every other")
  }
}
