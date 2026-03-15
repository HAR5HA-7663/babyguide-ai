/**
 * Onboarding — Baby profile setup screen.
 * First screen the parent sees to enter baby's details.
 */

import { motion } from "framer-motion";
import { Baby, ChevronRight } from "lucide-react";
import { useState } from "react";
import { BabyProfile } from "../types";

interface Props {
  onComplete: (profile: BabyProfile) => void;
}

export function Onboarding({ onComplete }: Props) {
  const [name, setName] = useState("");
  const [ageMonths, setAgeMonths] = useState(1);
  const [weightKg, setWeightKg] = useState("");

  const ageWeeks = ageMonths * 4;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onComplete({
      baby_name: name.trim(),
      age_weeks: ageWeeks,
      weight_kg: weightKg ? parseFloat(weightKg) : undefined,
      conditions: [],
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 32 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="w-full max-w-md"
      >
        {/* Logo */}
        <div className="text-center mb-10">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
            className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br from-green-400 to-blue-500 mb-4 shadow-xl"
          >
            <Baby className="w-10 h-10 text-white" />
          </motion.div>
          <h1 className="text-3xl font-bold text-white mb-2">BabyGuide AI</h1>
          <p className="text-slate-400 text-sm leading-relaxed">
            Your 24/7 visual guide through parenthood —<br />
            <span className="text-green-400">point, ask, and get help live.</span>
          </p>
        </div>

        {/* Form */}
        <motion.form
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          onSubmit={handleSubmit}
          className="bg-slate-800/60 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-8 shadow-2xl"
        >
          <h2 className="text-lg font-semibold text-white mb-6">
            Tell us about your baby
          </h2>

          {/* Baby name */}
          <div className="mb-5">
            <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">
              Baby's name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Emma"
              className="w-full bg-slate-900/60 border border-slate-600 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-green-400 focus:ring-1 focus:ring-green-400 transition"
              autoFocus
            />
          </div>

          {/* Age */}
          <div className="mb-5">
            <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">
              Age — <span className="text-green-400">{ageMonths} month{ageMonths !== 1 ? "s" : ""}</span>
            </label>
            <input
              type="range"
              min={0}
              max={24}
              value={ageMonths}
              onChange={(e) => setAgeMonths(parseInt(e.target.value))}
              className="w-full accent-green-400"
            />
            <div className="flex justify-between text-xs text-slate-500 mt-1">
              <span>Newborn</span>
              <span>6 months</span>
              <span>12 months</span>
              <span>24 months</span>
            </div>
          </div>

          {/* Weight (optional) */}
          <div className="mb-8">
            <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">
              Weight (kg) <span className="text-slate-600 normal-case font-normal">— optional</span>
            </label>
            <input
              type="number"
              value={weightKg}
              onChange={(e) => setWeightKg(e.target.value)}
              placeholder="e.g. 5.2"
              step="0.1"
              min="0"
              max="20"
              className="w-full bg-slate-900/60 border border-slate-600 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-green-400 focus:ring-1 focus:ring-green-400 transition"
            />
          </div>

          <button
            type="submit"
            disabled={!name.trim()}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-green-400 to-blue-500 hover:from-green-300 hover:to-blue-400 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3.5 rounded-xl transition-all duration-200 shadow-lg shadow-green-900/30"
          >
            Start Guiding
            <ChevronRight className="w-5 h-5" />
          </button>
        </motion.form>

        <p className="text-center text-xs text-slate-600 mt-6">
          Always consult your pediatrician for medical advice.
        </p>
      </motion.div>
    </div>
  );
}
