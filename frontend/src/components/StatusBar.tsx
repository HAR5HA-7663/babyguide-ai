/**
 * StatusBar — Connection status and audio level indicator.
 */

import { motion, AnimatePresence } from "framer-motion";
import { Wifi, WifiOff, Mic, Volume2, AlertCircle, CheckCircle } from "lucide-react";
import { ConnectionStatus } from "../types";
import { AudioWaveform } from "./VoiceInput";

interface Props {
  status: ConnectionStatus;
  babyName: string;
  lastText: string;
}

const STATUS_CONFIG: Record<
  ConnectionStatus,
  { label: string; color: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  idle:         { label: "Ready",        color: "text-slate-400", Icon: WifiOff },
  connecting:   { label: "Connecting…",  color: "text-yellow-400", Icon: Wifi },
  ready:        { label: "Connected",    color: "text-green-400", Icon: CheckCircle },
  listening:    { label: "Listening…",   color: "text-blue-400", Icon: Mic },
  speaking:     { label: "BabyGuide speaking…", color: "text-purple-400", Icon: Volume2 },
  error:        { label: "Error",        color: "text-red-400", Icon: AlertCircle },
  disconnected: { label: "Disconnected", color: "text-slate-500", Icon: WifiOff },
};

export function StatusBar({ status, babyName, lastText }: Props) {
  const config = STATUS_CONFIG[status];
  const Icon = config.Icon;

  return (
    <div className="flex flex-col gap-3">
      {/* Status row */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-slate-800/60 rounded-xl border border-slate-700/40">
        <Icon className={`w-4 h-4 ${config.color} shrink-0`} />
        <span className={`text-sm font-medium ${config.color}`}>{config.label}</span>

        {status === "listening" && (
          <div className="ml-auto">
            <AudioWaveform isActive={true} />
          </div>
        )}

        {status === "speaking" && (
          <div className="ml-auto flex gap-1 items-center">
            <Volume2 className="w-4 h-4 text-purple-400 animate-pulse" />
          </div>
        )}

        {babyName && (
          <span className="ml-auto text-xs text-slate-500">
            Helping with <span className="text-green-400">{babyName}</span>
          </span>
        )}
      </div>

      {/* Last AI response */}
      <AnimatePresence mode="wait">
        {lastText && (
          <motion.div
            key={lastText.slice(0, 20)}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="px-4 py-3 bg-slate-800/40 rounded-xl border border-slate-700/30"
          >
            <p className="text-sm text-slate-300 leading-relaxed">{lastText}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
