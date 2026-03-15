/**
 * BabyGuide AI — Main App
 * Orchestrates: onboarding → session creation → live guidance
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, Camera, CameraOff, Zap, StopCircle, RefreshCw } from "lucide-react";

import { BabyProfile } from "./types";
import { Onboarding } from "./components/Onboarding";
import { VideoFeed } from "./components/VideoFeed";
import { StatusBar } from "./components/StatusBar";
import { QuickActions } from "./components/QuickActions";
import { useGeminiLive } from "./hooks/useGeminiLive";
import { useVoiceInput } from "./components/VoiceInput";

const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL ?? "http://localhost:8080";

type AppState = "onboarding" | "session" | "error";

export default function App() {
  const [appState, setAppState] = useState<AppState>("onboarding");
  const [profile, setProfile] = useState<BabyProfile | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [micOn, setMicOn] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);

  // Audio output (play Gemini speech)
  const audioCtxRef = useRef<AudioContext | null>(null);

  const playAudioChunk = useCallback((data: ArrayBuffer) => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext({ sampleRate: 24000 });
    }
    const ctx = audioCtxRef.current;
    // data is raw PCM int16, 24kHz mono
    const int16 = new Int16Array(data);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 0x7fff;
    }
    const buffer = ctx.createBuffer(1, float32.length, 24000);
    buffer.copyToChannel(float32, 0);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start();
  }, []);

  const { status, lastText, overlays, error, connect, disconnect, sendAudio, sendVideoFrame, sendText, interrupt } =
    useGeminiLive(playAudioChunk);

  // Voice input
  const { isCapturing } = useVoiceInput({
    isActive: micOn && appState === "session",
    onAudioChunk: sendAudio,
    onInterrupt: interrupt,
  });

  // ─── Onboarding complete ───────────────────────────────────────────────────

  const handleOnboardingComplete = useCallback(async (p: BabyProfile) => {
    setProfile(p);
    setSetupError(null);

    try {
      const res = await fetch(`${BACKEND_URL}/api/session/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(p),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { session_id } = await res.json();
      setSessionId(session_id);
      setAppState("session");
      // Auto-connect WebSocket
      connect(session_id);
    } catch (err) {
      console.error("Session creation failed:", err);
      setSetupError("Failed to connect to BabyGuide backend. Is the server running?");
    }
  }, [connect]);

  // ─── Start/stop session ────────────────────────────────────────────────────

  const handleStop = useCallback(() => {
    disconnect();
    setMicOn(false);
    setCameraOn(false);
    setSessionId(null);
    setProfile(null);
    setAppState("onboarding");
  }, [disconnect]);

  // ─── Quick scenario ────────────────────────────────────────────────────────

  const handleScenario = useCallback(
    (prompt: string) => {
      if (status !== "ready" && status !== "listening" && status !== "speaking") return;
      sendText(prompt);
      // Auto-enable camera and mic if not already
      setCameraOn(true);
      setMicOn(true);
    },
    [status, sendText]
  );

  // ─── Interrupt on mic tap while AI speaking ────────────────────────────────

  const handleMicToggle = useCallback(() => {
    if (status === "speaking") {
      interrupt();
    }
    setMicOn((prev) => !prev);
  }, [status, interrupt]);

  // ─── Reconnect on error ────────────────────────────────────────────────────

  const handleReconnect = useCallback(() => {
    if (!sessionId) return;
    connect(sessionId);
  }, [sessionId, connect]);

  // ─── Render ────────────────────────────────────────────────────────────────

  if (appState === "onboarding") {
    return (
      <>
        <Onboarding onComplete={handleOnboardingComplete} />
        {setupError && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-red-900/90 border border-red-700 text-red-200 text-sm px-5 py-3 rounded-xl max-w-sm text-center">
            {setupError}
          </div>
        )}
      </>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-green-400" />
          <span className="font-bold text-white text-sm">BabyGuide AI</span>
        </div>
        {profile && (
          <span className="text-xs text-slate-400">
            {profile.baby_name} · {Math.floor(profile.age_weeks / 4)}mo
          </span>
        )}
        <button
          onClick={handleStop}
          className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 transition"
        >
          <StopCircle className="w-4 h-4" />
          End
        </button>
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col md:flex-row gap-4 p-4 overflow-auto">
        {/* Left: Video + controls */}
        <div className="flex flex-col gap-4 flex-1 min-w-0">
          <VideoFeed
            overlays={overlays}
            isActive={cameraOn}
            onFrame={sendVideoFrame}
          />

          {/* Controls */}
          <div className="flex items-center justify-center gap-4">
            {/* Mic button */}
            <motion.button
              whileTap={{ scale: 0.92 }}
              onClick={handleMicToggle}
              className={`flex items-center gap-2 px-5 py-3 rounded-xl font-medium text-sm transition-all ${
                micOn
                  ? "bg-green-500/20 border border-green-500/50 text-green-400"
                  : "bg-slate-800 border border-slate-700 text-slate-400 hover:border-slate-600"
              }`}
            >
              {micOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
              {micOn ? "Mic On" : "Mic Off"}
            </motion.button>

            {/* Camera button */}
            <motion.button
              whileTap={{ scale: 0.92 }}
              onClick={() => setCameraOn((p) => !p)}
              className={`flex items-center gap-2 px-5 py-3 rounded-xl font-medium text-sm transition-all ${
                cameraOn
                  ? "bg-blue-500/20 border border-blue-500/50 text-blue-400"
                  : "bg-slate-800 border border-slate-700 text-slate-400 hover:border-slate-600"
              }`}
            >
              {cameraOn ? <Camera className="w-4 h-4" /> : <CameraOff className="w-4 h-4" />}
              {cameraOn ? "Camera On" : "Camera Off"}
            </motion.button>

            {/* Interrupt button — only shown when AI is speaking */}
            <AnimatePresence>
              {status === "speaking" && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={interrupt}
                  className="px-5 py-3 rounded-xl font-medium text-sm bg-purple-500/20 border border-purple-500/50 text-purple-400"
                >
                  Interrupt
                </motion.button>
              )}
            </AnimatePresence>
          </div>

          {/* Status */}
          <StatusBar
            status={error ? "error" : status}
            babyName={profile?.baby_name ?? ""}
            lastText={error ?? lastText}
          />

          {/* Reconnect button on error */}
          {(status === "error" || status === "disconnected") && (
            <button
              onClick={handleReconnect}
              className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 text-sm hover:bg-slate-700 transition"
            >
              <RefreshCw className="w-4 h-4" />
              Reconnect
            </button>
          )}
        </div>

        {/* Right: Quick actions */}
        <div className="md:w-64 lg:w-72 shrink-0">
          <QuickActions
            onSelect={handleScenario}
            disabled={status === "idle" || status === "connecting" || status === "disconnected"}
          />
        </div>
      </main>
    </div>
  );
}
