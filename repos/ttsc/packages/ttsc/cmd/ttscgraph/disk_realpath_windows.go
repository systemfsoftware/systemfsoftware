//go:build windows

package main

import (
  "path/filepath"
  "strings"

  "golang.org/x/sys/windows"
)

// diskRealpath asks the opened object for its final path. filepath.EvalSymlinks
// can leave a readable file below a directory junction unresolved on Windows,
// which would erase the physical identity this state exists to retain.
func diskRealpath(path string) string {
  pointer, err := windows.UTF16PtrFromString(path)
  if err != nil {
    return ""
  }
  handle, err := windows.CreateFile(
    pointer,
    windows.FILE_READ_ATTRIBUTES,
    windows.FILE_SHARE_READ|windows.FILE_SHARE_WRITE|windows.FILE_SHARE_DELETE,
    nil,
    windows.OPEN_EXISTING,
    windows.FILE_FLAG_BACKUP_SEMANTICS,
    0,
  )
  if err != nil {
    return ""
  }
  defer windows.CloseHandle(handle)

  buffer := make([]uint16, windows.MAX_PATH)
  for {
    length, err := windows.GetFinalPathNameByHandle(
      handle,
      &buffer[0],
      uint32(len(buffer)),
      0,
    )
    if err != nil {
      return ""
    }
    if length < uint32(len(buffer)) {
      resolved := windows.UTF16ToString(buffer[:length])
      if strings.HasPrefix(resolved, `\\?\UNC\`) {
        resolved = `\\` + strings.TrimPrefix(resolved, `\\?\UNC\`)
      } else {
        resolved = strings.TrimPrefix(resolved, `\\?\`)
      }
      return filepath.Clean(resolved)
    }
    buffer = make([]uint16, length+1)
  }
}
