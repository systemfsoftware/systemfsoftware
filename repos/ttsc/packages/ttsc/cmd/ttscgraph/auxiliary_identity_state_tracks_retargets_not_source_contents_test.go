package main

import (
  "os"
  "os/exec"
  "path/filepath"
  "runtime"
  "testing"
)

// TestAuxiliaryIdentityStateTracksRetargetsNotSourceContents proves the two
// owners of a selected lexical module path stay separate:
//
//  1. ordinary source bytes are owned by graphSession.sourceHashes, so an
//     identity-only auxiliary state must not turn their edit into a reload;
//  2. retargeting the same lexical symlink or junction must invalidate even
//     when the old and new target bytes agree.
func TestAuxiliaryIdentityStateTracksRetargetsNotSourceContents(t *testing.T) {
  root := t.TempDir()
  first := filepath.Join(root, "first")
  second := filepath.Join(root, "second")
  if err := os.MkdirAll(first, 0o755); err != nil {
    t.Fatal(err)
  }
  if err := os.MkdirAll(second, 0o755); err != nil {
    t.Fatal(err)
  }
  for _, directory := range []string{first, second} {
    if err := os.WriteFile(filepath.Join(directory, "selection.ts"), []byte("export const value = 1;\n"), 0o644); err != nil {
      t.Fatal(err)
    }
  }

  link := filepath.Join(root, "linked")
  createAuxiliaryDirectoryLink(t, first, link)
  selected := filepath.Join(link, "selection.ts")
  previous := captureDiskStates([]auxiliaryInput{{path: selected, identityOnly: true}})
  initial := previous[selected]
  if !initial.Exists || initial.Realpath == "" || !initial.IdentityOnly {
    t.Fatalf("initial identity state = %+v", initial)
  }

  if err := os.WriteFile(filepath.Join(first, "selection.ts"), []byte("export const value = 2;\n"), 0o644); err != nil {
    t.Fatal(err)
  }
  if diskStatesChanged(previous) {
    t.Fatal("selected source contents leaked into identity-only auxiliary invalidation")
  }

  if err := os.Remove(link); err != nil {
    t.Fatal(err)
  }
  createAuxiliaryDirectoryLink(t, second, link)
  if !diskStatesChanged(previous) {
    t.Fatal("same-byte lexical link retarget did not invalidate its physical identity")
  }

  merged := compactAuxiliaryInputs([]auxiliaryInput{
    {path: selected, identityOnly: true},
    {path: selected},
  })
  if len(merged) != 1 || merged[0].identityOnly {
    t.Fatalf("content-sensitive duplicate did not win: %+v", merged)
  }
}

func createAuxiliaryDirectoryLink(t *testing.T, target, link string) {
  t.Helper()
  if runtime.GOOS == "windows" {
    command := exec.Command(
      "node",
      "-e",
      `require("node:fs").symlinkSync(process.argv[1], process.argv[2], "junction")`,
      target,
      link,
    )
    if output, err := command.CombinedOutput(); err != nil {
      t.Skipf("directory junction unavailable on this host: %v: %s", err, output)
    }
    return
  }
  if err := os.Symlink(target, link); err != nil {
    t.Skipf("directory symlink unavailable on this host: %v", err)
  }
}
