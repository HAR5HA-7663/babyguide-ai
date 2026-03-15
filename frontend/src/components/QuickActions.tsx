/**
 * QuickActions — One-tap scenario buttons for common parenting tasks.
 */

import { motion } from "framer-motion";

interface Scenario {
  id: string;
  emoji: string;
  label: string;
  prompt: string;
}

const SCENARIOS: Scenario[] = [
  {
    id: "swaddle",
    emoji: "👶",
    label: "Swaddling",
    prompt: "Help me swaddle my baby. I'll show you on camera.",
  },
  {
    id: "formula",
    emoji: "🍼",
    label: "Formula prep",
    prompt: "I need help preparing formula. Show me on my bottle.",
  },
  {
    id: "cry",
    emoji: "😢",
    label: "Cry diagnosis",
    prompt: "My baby is crying. Help me figure out why.",
  },
  {
    id: "diaper",
    emoji: "🧷",
    label: "Diaper change",
    prompt: "Guide me through a diaper change step by step.",
  },
  {
    id: "medicine",
    emoji: "💊",
    label: "Medicine scan",
    prompt: "I have a medicine I'd like to check. Is it safe for my baby?",
  },
  {
    id: "sleep",
    emoji: "🛏️",
    label: "Sleep safety",
    prompt: "Check my baby's sleep setup for safety issues.",
  },
];

interface Props {
  onSelect: (prompt: string) => void;
  disabled?: boolean;
}

export function QuickActions({ onSelect, disabled }: Props) {
  return (
    <div className="space-y-3">
      <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wider">
        Quick scenarios
      </h3>
      <div className="grid grid-cols-3 gap-2">
        {SCENARIOS.map((scenario, i) => (
          <motion.button
            key={scenario.id}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.05 }}
            onClick={() => onSelect(scenario.prompt)}
            disabled={disabled}
            className="flex flex-col items-center gap-1.5 p-3 bg-slate-800/60 hover:bg-slate-700/60 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl border border-slate-700/40 hover:border-green-500/40 transition-all duration-200 group"
          >
            <span className="text-2xl group-hover:scale-110 transition-transform">
              {scenario.emoji}
            </span>
            <span className="text-xs text-slate-300 font-medium text-center leading-tight">
              {scenario.label}
            </span>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
