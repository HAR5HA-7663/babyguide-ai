/**
 * AROverlay — React component wrapper for the Canvas AR overlay.
 * Renders on top of the VideoFeed component.
 */

import { useEffect, useRef } from "react";
import { Overlay } from "../types";
import { useAROverlay } from "../hooks/useAROverlay";

interface Props {
  overlays: Overlay[];
  videoRef: React.RefObject<HTMLVideoElement>;
  className?: string;
}

export function AROverlay({ overlays, videoRef, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { render, clear } = useAROverlay(canvasRef);

  useEffect(() => {
    if (overlays.length === 0) {
      clear();
      return;
    }
    render(overlays, videoRef.current);
    // Clean up on unmount or when overlays disappear
    return () => clear();
  }, [overlays, videoRef, render, clear]);

  return (
    <canvas
      ref={canvasRef}
      className={`ar-canvas ${className ?? ""}`}
      style={{ width: "100%", height: "100%" }}
    />
  );
}
