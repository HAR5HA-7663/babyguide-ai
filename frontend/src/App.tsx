import { useCallback, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

import { BabyProfile } from "./types";
import { Onboarding } from "./components/Onboarding";
import { VideoFeed } from "./components/VideoFeed";
import { StatusBar } from "./components/StatusBar";
import { QuickActions } from "./components/QuickActions";
import { useGeminiLive } from "./hooks/useGeminiLive";
import { useVoiceInput } from "./components/VoiceInput";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:8080";

type AppState = "onboarding" | "session";

export default function App() {
  const [appState, setAppState] = useState<AppState>("onboarding");
  const [profile, setProfile] = useState<BabyProfile | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [micOn, setMicOn] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [showScenarios, setShowScenarios] = useState(false);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const nextPlayTimeRef = useRef<number>(0);

  const getAudioCtx = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
    }
    if (audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }, []);

  // Called on button click to satisfy browser autoplay policy
  const unlockAudio = useCallback(() => { getAudioCtx(); }, [getAudioCtx]);

  const playAudioChunk = useCallback(async (data: ArrayBuffer) => {
    if (data.byteLength === 0) return;
    const ctx = getAudioCtx();

    try {
      // Wrap raw PCM int16 LE 24kHz in a WAV container so decodeAudioData handles it
      const wav = pcmToWav(data, 24000);
      const audioBuffer = await ctx.decodeAudioData(wav);

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);

      // Schedule gaplessly after previous chunk
      const startAt = Math.max(ctx.currentTime + 0.05, nextPlayTimeRef.current);
      source.start(startAt);
      nextPlayTimeRef.current = startAt + audioBuffer.duration;
    } catch (e) {
      console.error("[Audio] decode failed:", e);
    }
  }, [getAudioCtx]);

  const { status, lastText, overlays, error, connect, disconnect, sendAudio, sendVideoFrame, sendText, interrupt } =
    useGeminiLive(playAudioChunk);

  const { micLevel } = useVoiceInput({
    isActive: micOn && appState === "session",
    onAudioChunk: sendAudio,
    onInterrupt: interrupt,
  });

  const handleOnboardingComplete = useCallback(async (p: BabyProfile) => {
    unlockAudio();
    setProfile(p);
    setSetupError(null);
    setSessionLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/session/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(p),
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const { session_id } = await res.json();
      setSessionId(session_id);
      setAppState("session");
      setCameraOn(true);
      setMicOn(true);
      connect(session_id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setSetupError(`Can't reach backend: ${msg}. Is it running on port 8080?`);
    } finally {
      setSessionLoading(false);
    }
  }, [connect]);

  const handleStop = useCallback(() => {
    disconnect();
    setMicOn(false);
    setCameraOn(false);
    setSessionId(null);
    setProfile(null);
    setAppState("onboarding");
  }, [disconnect]);

  const handleScenario = useCallback((prompt: string) => {
    sendText(prompt);
    setCameraOn(true);
    setMicOn(true);
    setShowScenarios(false);
  }, [sendText]);

  const handleMicToggle = useCallback(() => {
    if (status === "speaking") {
      interrupt();
      nextPlayTimeRef.current = 0;
    }
    setMicOn(p => !p);
    unlockAudio(); // every button press re-confirms user gesture
  }, [status, interrupt, unlockAudio]);

  const handleReconnect = useCallback(() => {
    if (sessionId) connect(sessionId);
  }, [sessionId, connect]);

  if (appState === "onboarding") {
    return (
      <>
        <Onboarding
          onComplete={handleOnboardingComplete}
          isLoading={sessionLoading}
          error={setupError}
        />
      </>
    );
  }

  const isConnected = status === "ready" || status === "listening" || status === "speaking";

  return (
    <div className="relative flex h-screen overflow-hidden" style={{ background: "var(--night)" }}>

      {/* Subtle ambient orb */}
      <div className="bg-orb w-[600px] h-[600px] opacity-40"
        style={{ background: "radial-gradient(circle, rgba(93,237,228,0.05), transparent 70%)",
          top: "50%", left: "50%", transform: "translate(-50%,-50%)" }} />

      {/* ── Main layout: camera left, sidebar right ── */}
      <div className="relative z-10 flex flex-1 overflow-hidden">

        {/* Camera column */}
        <div className="flex flex-col flex-1 p-4 gap-3 min-w-0">

          {/* Header */}
          <div className="flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5">
              {/* Moon logo */}
              <div className="relative w-7 h-7 rounded-full shrink-0"
                style={{ background: "radial-gradient(circle at 35% 35%, var(--teal), #1A2B47)",
                  boxShadow: "0 0 12px rgba(93,237,228,0.25)" }}>
                <div className="absolute top-0.5 right-0.5 rounded-full w-4 h-4"
                  style={{ background: "var(--night)" }} />
              </div>
              <span className="font-display text-base font-light" style={{ color: "var(--cream)" }}>
                BabyGuide
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-md font-mono"
                style={{ background: "rgba(93,237,228,0.08)", color: "var(--teal)",
                  border: "1px solid rgba(93,237,228,0.2)" }}>
                gemini-2.5-flash
              </span>
            </div>

            <div className="flex items-center gap-3">
              {profile && (
                <span className="text-xs" style={{ color: "var(--muted)" }}>
                  {profile.baby_name} · {ageLabel(profile.age_weeks)}
                </span>
              )}
              <button
                onClick={handleStop}
                className="text-xs px-3 py-1.5 rounded-xl transition"
                style={{ color: "var(--muted-light)", background: "var(--navy-mid)",
                  border: "1px solid rgba(255,255,255,0.05)" }}
              >
                End
              </button>
            </div>
          </div>

          {/* Camera — fills available space, capped so controls stay visible */}
          <div
            className="flex-1 min-h-0 rounded-2xl overflow-hidden transition-all duration-500"
            style={{ maxHeight: "calc(100vh - 160px)", border: "1px solid rgba(93,237,228,0.1)",
              boxShadow: cameraOn
                ? "0 0 0 1px rgba(93,237,228,0.15), 0 0 60px rgba(93,237,228,0.08)"
                : "0 0 0 1px rgba(93,237,228,0.05)" }}
          >
            <VideoFeed overlays={overlays} isActive={cameraOn} onFrame={sendVideoFrame} />
          </div>

          {/* Status */}
          <div className="shrink-0">
            <StatusBar
              status={error ? "error" : status}
              babyName={profile?.baby_name ?? ""}
              lastText={error ?? lastText}
              micLevel={micLevel}
            />
          </div>

          {/* Controls bar */}
          <div className="flex items-center gap-2 shrink-0">

            {/* Mic */}
            <ControlButton
              active={micOn}
              onClick={handleMicToggle}
              activeColor="var(--teal)"
              label={micOn ? "Mic on" : "Mic off"}
              icon={micOn
                ? <MicIcon color="var(--teal)" />
                : <MicOffIcon color="var(--muted-light)" />}
            />

            {/* Camera */}
            <ControlButton
              active={cameraOn}
              onClick={() => setCameraOn(p => !p)}
              activeColor="var(--teal)"
              label={cameraOn ? "Camera on" : "Camera off"}
              icon={cameraOn
                ? <CamIcon color="var(--teal)" />
                : <CamOffIcon color="var(--muted-light)" />}
            />

            {/* Scenarios toggle */}
            <button
              onClick={() => setShowScenarios(p => !p)}
              className="ml-auto flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium transition"
              style={{
                background: showScenarios ? "rgba(93,237,228,0.12)" : "var(--navy-mid)",
                border: `1px solid ${showScenarios ? "rgba(93,237,228,0.3)" : "rgba(255,255,255,0.05)"}`,
                color: showScenarios ? "var(--teal)" : "var(--muted-light)",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.4"/>
                <path d="M7 4v3.5L9 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
              Scenarios
            </button>

            {/* Interrupt — only when AI talking */}
            <AnimatePresence>
              {status === "speaking" && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.85 }}
                  whileTap={{ scale: 0.92 }}
                  onClick={() => { interrupt(); nextPlayTimeRef.current = 0; }}
                  className="px-4 py-2.5 rounded-xl text-xs font-medium"
                  style={{ background: "rgba(245,201,122,0.12)",
                    border: "1px solid rgba(245,201,122,0.3)", color: "var(--amber)" }}
                >
                  Interrupt
                </motion.button>
              )}
            </AnimatePresence>

            {/* Reconnect */}
            {(status === "error" || status === "disconnected") && (
              <button onClick={handleReconnect}
                className="px-4 py-2.5 rounded-xl text-xs font-medium"
                style={{ background: "var(--navy-mid)", border: "1px solid rgba(255,255,255,0.06)",
                  color: "var(--muted-light)" }}>
                Reconnect
              </button>
            )}
          </div>
        </div>

        {/* Scenarios sidebar */}
        <AnimatePresence>
          {showScenarios && (
            <motion.aside
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 240, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="shrink-0 overflow-hidden"
              style={{ borderLeft: "1px solid rgba(255,255,255,0.05)" }}
            >
              <div className="w-60 h-full p-4" style={{ background: "var(--navy)" }}>
                <QuickActions
                  onSelect={handleScenario}
                  disabled={!isConnected}
                />
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ageLabel(weeks: number) {
  const m = Math.floor(weeks / 4);
  return m === 0 ? "newborn" : `${m}mo`;
}

function ControlButton({ active, onClick, label, icon, activeColor }: {
  active: boolean; onClick: () => void;
  label: string; icon: React.ReactNode; activeColor: string;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.92 }}
      onClick={onClick}
      className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium transition-all"
      style={{
        background: active ? `${activeColor}14` : "var(--navy-mid)",
        border: `1px solid ${active ? `${activeColor}44` : "rgba(255,255,255,0.05)"}`,
        color: active ? activeColor : "var(--muted-light)",
      }}
    >
      {icon}
      {label}
    </motion.button>
  );
}

// ─── PCM → WAV wrapper ───────────────────────────────────────────────────────
// Wrapping raw int16 PCM in a WAV header lets the browser decode it reliably
// via decodeAudioData instead of us manually converting bytes.
function pcmToWav(pcmBuffer: ArrayBuffer, sampleRate: number): ArrayBuffer {
  const pcm = new Uint8Array(pcmBuffer);
  const wavBuffer = new ArrayBuffer(44 + pcm.byteLength);
  const view = new DataView(wavBuffer);
  const write = (offset: number, value: number, bytes: number) => {
    for (let i = 0; i < bytes; i++) view.setUint8(offset + i, (value >> (8 * i)) & 0xff);
  };
  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  write(4,  36 + pcm.byteLength, 4);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  write(16, 16, 4);           // chunk size
  write(20, 1,  2);           // PCM format
  write(22, 1,  2);           // mono
  write(24, sampleRate, 4);
  write(28, sampleRate * 2, 4); // byte rate (16-bit mono)
  write(32, 2,  2);           // block align
  write(34, 16, 2);           // bits per sample
  writeStr(36, "data");
  write(40, pcm.byteLength, 4);
  new Uint8Array(wavBuffer, 44).set(pcm);
  return wavBuffer;
}

// Minimal inline SVG icons
const MicIcon = ({ color }: { color: string }) => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <rect x="4.5" y="1" width="5" height="7" rx="2.5" stroke={color} strokeWidth="1.3"/>
    <path d="M2 7.5A5 5 0 0012 7.5M7 12.5v-2" stroke={color} strokeWidth="1.3" strokeLinecap="round"/>
  </svg>
);
const MicOffIcon = ({ color }: { color: string }) => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <rect x="4.5" y="1" width="5" height="7" rx="2.5" stroke={color} strokeWidth="1.3"/>
    <path d="M2 7.5A5 5 0 0012 7.5M7 12.5v-2M2 2l10 10" stroke={color} strokeWidth="1.3" strokeLinecap="round"/>
  </svg>
);
const CamIcon = ({ color }: { color: string }) => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M1 4.5h8a1 1 0 011 1v4a1 1 0 01-1 1H1a1 1 0 01-1-1v-4a1 1 0 011-1z" stroke={color} strokeWidth="1.3"/>
    <path d="M10 6.5l3-2v5l-3-2" stroke={color} strokeWidth="1.3" strokeLinejoin="round"/>
  </svg>
);
const CamOffIcon = ({ color }: { color: string }) => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M1 4.5h8a1 1 0 011 1v4a1 1 0 01-1 1H1a1 1 0 01-1-1v-4a1 1 0 011-1z" stroke={color} strokeWidth="1.3"/>
    <path d="M10 6.5l3-2v5l-3-2M2 2l10 10" stroke={color} strokeWidth="1.3" strokeLinecap="round"/>
  </svg>
);
