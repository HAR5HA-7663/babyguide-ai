/**
 * VideoFeed — WebRTC camera capture with AR overlay canvas.
 * Captures video + sends JPEG frames to backend every 500ms.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { Camera, CameraOff } from "lucide-react";
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

  // Start/stop camera
  useEffect(() => {
    if (!isActive) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setCameraReady(false);
      return;
    }

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment", width: 640, height: 480 } })
      .then((stream) => {
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
        setCameraReady(true);
        setCameraError(null);
      })
      .catch((err) => {
        console.error("[VideoFeed] Camera error:", err);
        setCameraError("Camera access denied");
      });

    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [isActive]);

  // Capture JPEG frames and send to backend
  const captureFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasCapRef.current;
    if (!video || !canvas || !cameraReady || video.readyState < 2) return;

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        blob.arrayBuffer().then(onFrame);
      },
      "image/jpeg",
      JPEG_QUALITY
    );
  }, [cameraReady, onFrame]);

  useEffect(() => {
    if (!isActive || !cameraReady) return;
    const timer = setInterval(captureFrame, FRAME_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [isActive, cameraReady, captureFrame]);

  return (
    <div className="relative w-full aspect-video bg-slate-900 rounded-2xl overflow-hidden">
      {/* Video element */}
      <video
        ref={videoRef}
        className="w-full h-full object-cover"
        autoPlay
        muted
        playsInline
      />

      {/* AR Canvas overlay */}
      {cameraReady && overlays.length > 0 && (
        <AROverlay overlays={overlays} videoRef={videoRef} />
      )}

      {/* Placeholder when camera is off */}
      {!isActive && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-800/90">
          <CameraOff className="w-12 h-12 text-slate-500 mb-3" />
          <p className="text-slate-400 text-sm">Camera is off</p>
        </div>
      )}

      {/* Camera loading state */}
      {isActive && !cameraReady && !cameraError && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
          <div className="flex gap-2 items-center text-slate-400">
            <Camera className="w-5 h-5 animate-pulse" />
            <span className="text-sm">Starting camera...</span>
          </div>
        </div>
      )}

      {/* Camera error */}
      {cameraError && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
          <p className="text-red-400 text-sm">{cameraError}</p>
        </div>
      )}

      {/* Live indicator */}
      {cameraReady && isActive && (
        <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/50 rounded-full px-3 py-1">
          <div className="w-2 h-2 rounded-full bg-red-500 live-dot" />
          <span className="text-white text-xs font-medium">LIVE</span>
        </div>
      )}

      {/* Hidden canvas for frame capture */}
      <canvas ref={canvasCapRef} className="hidden" />
    </div>
  );
}
