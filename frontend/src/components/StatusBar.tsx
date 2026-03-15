import { motion, AnimatePresence } from "framer-motion";
import { ConnectionStatus } from "../types";
import { AudioWaveform } from "./VoiceInput";

interface Props {
  status: ConnectionStatus;
  babyName: string;
  lastText: string;
  micLevel?: number;
}

const STATUS_META: Record<ConnectionStatus, { label: string; dot: string }> = {
  idle:         { label: "Ready",              dot: "var(--muted)" },
  connecting:   { label: "Connecting…",        dot: "var(--amber)" },
  ready:        { label: "Connected",          dot: "var(--teal)" },
  listening:    { label: "Listening",          dot: "var(--teal)" },
  speaking:     { label: "Speaking",           dot: "var(--amber)" },
  error:        { label: "Connection error",   dot: "var(--coral)" },
  disconnected: { label: "Disconnected",       dot: "var(--muted)" },
};

export function StatusBar({ status, babyName, lastText, micLevel = 0 }: Props) {
  const meta = STATUS_META[status];

  return (
    <div className="flex flex-col gap-2">
      {/* Status row */}
      <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl"
        style={{ background: "var(--navy-mid)", border: "1px solid rgba(255,255,255,0.05)" }}>

        <div className="w-2 h-2 rounded-full shrink-0"
          style={{ background: meta.dot,
            boxShadow: status === "listening" || status === "ready"
              ? `0 0 6px ${meta.dot}` : "none" }} />

        <span className="text-xs font-medium" style={{ color: "var(--muted-light)" }}>
          {meta.label}
        </span>

        {status === "listening" && (
          <div className="ml-1"><AudioWaveform isActive={true} micLevel={micLevel} /></div>
        )}

        {babyName && (
          <span className="ml-auto text-xs" style={{ color: "var(--muted)" }}>
            {babyName}
          </span>
        )}
      </div>

      {/* Last response text */}
      <AnimatePresence mode="wait">
        {lastText && (
          <motion.div
            key={lastText.slice(0, 30)}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="px-3 py-2.5 rounded-xl"
            style={{ background: "var(--navy-mid)", border: "1px solid rgba(255,255,255,0.04)" }}
          >
            <p className="text-xs leading-relaxed" style={{ color: "var(--muted-light)" }}>
              {lastText}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
