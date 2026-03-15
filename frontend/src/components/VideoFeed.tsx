import { useEffect, useRef, useState, useCallback } from "react";
import { Overlay } from "../types";
import { AROverlay } from "./AROverlay";

const FRAME_INTERVAL_MS = 500;
const JPEG_QUALITY = 0.7;

interface Props {
  overlays: Overlay[];
  isActive: boolean;
  onFrame: (jpegData: ArrayBuffer) => void;
}

export function VideoFeed({ overlays, isActive, onFrame }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasCapRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  useEffect(() => {
    if (!isActive) {
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
      setCameraReady(false);
      return;
    }

    // Try rear camera first, fall back to any
    const constraints = { video: { facingMode: "environment", width: 640, height: 480 } };
    navigator.mediaDevices.getUserMedia(constraints)
      .catch(() => navigator.mediaDevices.getUserMedia({ video: true }))
      .then(stream => {
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
        setCameraReady(true);
        setCameraError(null);
      })
      .catch(err => {
        console.error("[VideoFeed] Camera error:", err);
        setCameraError(err.name === "NotAllowedError"
          ? "Camera access denied — click the camera icon in your browser address bar to allow it."
          : "Camera unavailable");
      });

    return () => { streamRef.current?.getTracks().forEach(t => t.stop()); };
  }, [isActive]);

  const captureFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasCapRef.current;
    if (!video || !canvas || !cameraReady || video.readyState < 2) return;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(blob => { blob?.arrayBuffer().then(onFrame); }, "image/jpeg", JPEG_QUALITY);
  }, [cameraReady, onFrame]);

  useEffect(() => {
    if (!isActive || !cameraReady) return;
    const timer = setInterval(captureFrame, FRAME_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [isActive, cameraReady, captureFrame]);

  return (
    <div className="relative w-full h-full overflow-hidden rounded-2xl">
      {/* Flip wrapper — mirrors the display only, capture canvas is unaffected */}
      <div className="w-full h-full" style={{ transform: "scaleX(-1)" }}>
        <video
          ref={videoRef}
          className="w-full h-full object-contain"
          style={{ background: "var(--night)" }}
          autoPlay muted playsInline
        />
        {cameraReady && overlays.length > 0 && (
          <AROverlay overlays={overlays} videoRef={videoRef} />
        )}
      </div>

      {/* Camera off state */}
      {!isActive && (
        <div className="absolute inset-0 flex flex-col items-center justify-center"
          style={{ background: "var(--navy)" }}>
          <div className="mb-4 opacity-30">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <path d="M8 16h8l4-6h8l4 6h8a2 2 0 012 2v22a2 2 0 01-2 2H8a2 2 0 01-2-2V18a2 2 0 012-2z"
                stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
              <circle cx="24" cy="29" r="7" stroke="currentColor" strokeWidth="2"/>
              <line x1="4" y1="4" x2="44" y2="44" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <p className="text-sm" style={{ color: "var(--muted-light)" }}>Camera off</p>
          <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>Tap the camera button below</p>
        </div>
      )}

      {/* Loading */}
      {isActive && !cameraReady && !cameraError && (
        <div className="absolute inset-0 flex items-center justify-center"
          style={{ background: "var(--navy)" }}>
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
              style={{ borderColor: "var(--teal)", borderTopColor: "transparent" }} />
            <p className="text-sm" style={{ color: "var(--muted-light)" }}>Starting camera…</p>
          </div>
        </div>
      )}

      {/* Error */}
      {cameraError && (
        <div className="absolute inset-0 flex items-center justify-center p-6"
          style={{ background: "var(--navy)" }}>
          <div className="text-center">
            <div className="w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center"
              style={{ background: "rgba(255,123,107,0.15)" }}>
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                <circle cx="11" cy="11" r="10" stroke="#FF7B6B" strokeWidth="1.5"/>
                <path d="M11 7v5M11 15v.5" stroke="#FF7B6B" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
            <p className="text-sm text-center leading-relaxed" style={{ color: "#FF7B6B" }}>{cameraError}</p>
          </div>
        </div>
      )}

      {/* Live badge */}
      {cameraReady && isActive && (
        <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full"
          style={{ background: "rgba(7,11,18,0.7)", backdropFilter: "blur(8px)" }}>
          <div className="w-1.5 h-1.5 rounded-full live-dot" style={{ background: "var(--coral)" }} />
          <span className="text-xs font-medium tracking-wide" style={{ color: "var(--cream)" }}>LIVE</span>
        </div>
      )}

      <canvas ref={canvasCapRef} className="hidden" />
    </div>
  );
}
