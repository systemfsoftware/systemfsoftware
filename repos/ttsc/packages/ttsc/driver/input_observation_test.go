package driver

import (
  "crypto/sha256"
  "encoding/hex"
  "os"
  "os/exec"
  "path/filepath"
  "runtime"
  "testing"
)

func TestInputObservationFSRejectsRestoredContent(t *testing.T) {
  root := t.TempDir()
  file := filepath.Join(root, "external.d.ts")
  if err := os.WriteFile(file, []byte("A"), 0o644); err != nil {
    t.Fatal(err)
  }
  observed := newInputObservationFS(DefaultFS())
  if contents, ok := observed.ReadFile(file); !ok || contents != "A" {
    t.Fatalf("first read = %q, %v", contents, ok)
  }
  if err := os.WriteFile(file, []byte("B"), 0o644); err != nil {
    t.Fatal(err)
  }
  if contents, ok := observed.ReadFile(file); !ok || contents != "B" {
    t.Fatalf("second read = %q, %v", contents, ok)
  }
  if err := os.WriteFile(file, []byte("A"), 0o644); err != nil {
    t.Fatal(err)
  }
  if _, _, ok := observed.proof(file); ok {
    t.Fatal("A-B-A observation unexpectedly produced reusable proof")
  }
}

func TestInputObservationFSProvesReadBytesAndMissingCandidates(t *testing.T) {
  root := t.TempDir()
  file := filepath.Join(root, "selected.ts")
  missing := filepath.Join(root, "superseding.ts")
  contents := "export const selected = true;\n"
  if err := os.WriteFile(file, []byte(contents), 0o644); err != nil {
    t.Fatal(err)
  }
  observed := newInputObservationFS(DefaultFS())
  if !observed.FileExists(file) {
    t.Fatal("selected file was not found")
  }
  if _, ok := observed.ReadFile(file); !ok {
    t.Fatal("selected file was not read")
  }
  if observed.FileExists(missing) {
    t.Fatal("missing candidate unexpectedly exists")
  }

  digest := sha256.Sum256([]byte(contents))
  wantHash := hex.EncodeToString(digest[:])
  hash, realpath, ok := observed.proof(file)
  if !ok || hash == nil || *hash != wantHash {
    t.Fatalf("selected proof hash = %v, %v", hash, ok)
  }
  wantRealpath, err := filepath.EvalSymlinks(file)
  if err != nil {
    t.Fatal(err)
  }
  if realpath == nil || filepath.Clean(*realpath) != filepath.Clean(wantRealpath) {
    t.Fatalf("selected proof realpath = %v, want %q", realpath, wantRealpath)
  }
  hash, realpath, ok = observed.proof(missing)
  if !ok || hash != nil || realpath != nil {
    t.Fatalf("missing proof = %v, %v, %v", hash, realpath, ok)
  }
}

func TestInputObservationFSHashesCompilerDecodedText(t *testing.T) {
  root := t.TempDir()
  file := filepath.Join(root, "bom.ts")
  text := "export const value = true;\n"
  raw := append([]byte{0xef, 0xbb, 0xbf}, []byte(text)...)
  if err := os.WriteFile(file, raw, 0o644); err != nil {
    t.Fatal(err)
  }
  observed := newInputObservationFS(DefaultFS())
  contents, ok := observed.ReadFile(file)
  if !ok || contents != text {
    t.Fatalf("compiler read = %q, %v; want decoded text", contents, ok)
  }
  digest := sha256.Sum256([]byte(text))
  hash, _, ok := observed.proof(file)
  if !ok || hash == nil || *hash != hex.EncodeToString(digest[:]) {
    t.Fatalf("decoded proof hash = %v, %v", hash, ok)
  }
}

func TestInputObservationFSJoinsSelectedAliasProbeToPhysicalRead(t *testing.T) {
  root := t.TempDir()
  target := filepath.Join(root, "target")
  if err := os.Mkdir(target, 0o755); err != nil {
    t.Fatal(err)
  }
  physical := filepath.Join(target, "value.js")
  contents := "export const value = true;\n"
  if err := os.WriteFile(physical, []byte(contents), 0o644); err != nil {
    t.Fatal(err)
  }
  alias := filepath.Join(root, "alias")
  if runtime.GOOS == "windows" {
    command := exec.Command(
      "node",
      "-e",
      `require("node:fs").symlinkSync(process.argv[1], process.argv[2], "junction")`,
      target,
      alias,
    )
    if output, err := command.CombinedOutput(); err != nil {
      t.Skipf("directory junction unavailable on this host: %v: %s", err, output)
    }
  } else if err := os.Symlink(target, alias); err != nil {
    t.Skipf("directory symlink unavailable on this host: %v", err)
  }
  lexical := filepath.Join(alias, "value.js")
  observed := newInputObservationFS(DefaultFS())
  if !observed.FileExists(lexical) {
    t.Fatal("selected lexical alias was not found")
  }
  if _, ok := observed.ReadFile(physical); !ok {
    t.Fatal("selected physical source was not read")
  }

  digest := sha256.Sum256([]byte(contents))
  hash, realpath, ok := observed.proof(lexical)
  if !ok || hash == nil || *hash != hex.EncodeToString(digest[:]) {
    t.Fatalf("alias proof hash = %v, %v", hash, ok)
  }
  if realpath == nil {
    t.Fatalf("alias proof realpath = nil, want %q", physical)
  }
  actualInfo, err := os.Stat(*realpath)
  if err != nil {
    t.Fatal(err)
  }
  expectedInfo, err := os.Stat(physical)
  if err != nil {
    t.Fatal(err)
  }
  if !os.SameFile(actualInfo, expectedInfo) {
    t.Fatalf("alias proof realpath = %q, want %q", *realpath, physical)
  }
}
