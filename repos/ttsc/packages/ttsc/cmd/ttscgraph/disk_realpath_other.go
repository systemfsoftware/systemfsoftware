//go:build !windows

package main

import "path/filepath"

func diskRealpath(path string) string {
  resolved, err := filepath.EvalSymlinks(path)
  if err != nil {
    return ""
  }
  if absolute, err := filepath.Abs(resolved); err == nil {
    resolved = absolute
  }
  return filepath.Clean(resolved)
}
