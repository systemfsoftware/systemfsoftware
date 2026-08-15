package driver_test

import (
  "bytes"
  "errors"
  "strings"
  "testing"

  "github.com/samchon/ttsc/packages/ttsc/driver"
)

// TestLSPFrameReaderRejectsOversizeHeader verifies frame-header size hardening.
//
// Content-Length is already capped before body allocation, but a malicious peer
// can also send a huge header block. The reader must reject that frame before
// preserving unbounded header text for proxy forwarding.
//
// 1. Feed a frame with a header line larger than MaxHeaderBytes.
// 2. Assert Read returns ErrFrameTooLarge.
// 3. Repeat without a terminating newline to pin the streaming cap path.
func TestLSPFrameReaderRejectsOversizeHeader(t *testing.T) {
  frame := []byte(
    "X-Long: " + strings.Repeat("x", driver.MaxHeaderBytes+1) +
      "\r\nContent-Length: 2\r\n\r\n{}",
  )
  fr := driver.NewFrameReader(bytes.NewReader(frame))

  _, _, err := fr.Read()
  if !errors.Is(err, driver.ErrFrameTooLarge) {
    t.Fatalf("expected ErrFrameTooLarge, got %v", err)
  }

  noNewline := []byte("X-Long: " + strings.Repeat("x", driver.MaxHeaderBytes+1))
  fr = driver.NewFrameReader(bytes.NewReader(noNewline))

  _, _, err = fr.Read()
  if !errors.Is(err, driver.ErrFrameTooLarge) {
    t.Fatalf("expected ErrFrameTooLarge for unterminated header, got %v", err)
  }
}
