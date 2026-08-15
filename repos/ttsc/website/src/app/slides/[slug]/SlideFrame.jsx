"use client";

import { useEffect, useRef } from "react";

export default function SlideFrame({ src, title }) {
  const frame = useRef(null);

  useEffect(() => {
    frame.current?.focus();
  }, []);

  return (
    <iframe
      ref={frame}
      src={src}
      title={title}
      allow="fullscreen"
      allowFullScreen
      onLoad={() => frame.current?.focus()}
      tabIndex={0}
    />
  );
}
