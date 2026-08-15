package strip_test

import (
  "os"
  "path/filepath"
  "runtime"
  "testing"

  "github.com/samchon/ttsc/packages/ttsc/driver/windowsjunction"
)

// TestPhysicalHostInputResolvesWindowsJunction verifies JSON config identity
// proof uses the same physical file that Node's native realpath observes.
func TestPhysicalHostInputResolvesWindowsJunction(t *testing.T) {
  if runtime.GOOS != "windows" {
    t.Skip("Windows junction boundary")
  }
  root := t.TempDir()
  target := filepath.Join(root, "target")
  link := filepath.Join(root, "link")
  if err := os.MkdirAll(target, 0o755); err != nil {
    t.Fatal(err)
  }
  file := filepath.Join(target, "strip.config.json")
  if err := os.WriteFile(file, []byte(`{"calls":[]}`), 0o644); err != nil {
    t.Fatal(err)
  }
  if err := windowsjunction.Create(link, target); err != nil {
    t.Fatal(err)
  }

  got := stripPhysicalHostInput(filepath.Join(link, filepath.Base(file)))
  want, err := filepath.EvalSymlinks(file)
  if err != nil {
    t.Fatal(err)
  }
  if got == nil || filepath.Clean(*got) != filepath.Clean(want) {
    value := "<nil>"
    if got != nil {
      value = *got
    }
    t.Fatalf("physical host input = %q, want %q", value, want)
  }
}
