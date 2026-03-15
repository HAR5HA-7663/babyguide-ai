import { motion } from "framer-motion";

interface Scenario {
  id: string;
  icon: string;
  label: string;
  sub: string;
  prompt: string;
}

const SCENARIOS: Scenario[] = [
  { id: "swaddle",  icon: "👶", label: "Swaddle",   sub: "Step-by-step",    prompt: "Help me swaddle my baby. I'll show you on camera." },
  { id: "formula",  icon: "🍼", label: "Formula",   sub: "Prep guide",      prompt: "I need help preparing formula. Show me on my bottle." },
  { id: "cry",      icon: "😢", label: "Crying",    sub: "Find out why",    prompt: "My baby is crying. Help me figure out why." },
  { id: "diaper",   icon: "🧷", label: "Diaper",    sub: "Change guide",    prompt: "Guide me through a diaper change step by step." },
  { id: "medicine", icon: "💊", label: "Medicine",  sub: "Safety check",    prompt: "I have a medicine I'd like to check. Is it safe for my baby?" },
  { id: "sleep",    icon: "🛏️", label: "Sleep",     sub: "Safety check",    prompt: "Check my baby's sleep setup for safety issues." },
];

interface Props {
  onSelect: (prompt: string) => void;
  disabled?: boolean;
}

export function QuickActions({ onSelect, disabled }: Props) {
  return (
    <div className="h-full flex flex-col">
      <p className="text-xs tracking-widest uppercase mb-3 font-medium"
        style={{ color: "var(--muted)" }}>
        Scenarios
      </p>

      <div className="flex flex-col gap-2 overflow-y-auto">
        {SCENARIOS.map((s, i) => (
          <motion.button
            key={s.id}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.06, duration: 0.35 }}
            onClick={() => onSelect(s.prompt)}
            disabled={disabled}
            className="scenario-card w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <span className="text-xl shrink-0">{s.icon}</span>
            <div className="min-w-0">
              <p className="text-sm font-medium leading-none mb-0.5"
                style={{ color: "var(--cream)" }}>{s.label}</p>
              <p className="text-xs" style={{ color: "var(--muted)" }}>{s.sub}</p>
            </div>
            <svg className="ml-auto shrink-0 opacity-30" width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M5 2.5l4.5 4.5L5 11.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
