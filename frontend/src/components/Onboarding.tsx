import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import { BabyProfile } from "../types";

interface Props {
  onComplete: (profile: BabyProfile) => void;
  isLoading?: boolean;
  error?: string | null;
}

const STORAGE_KEY = "babyguide_profiles";

function loadProfiles(): BabyProfile[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveProfile(profile: BabyProfile) {
  const existing = loadProfiles();
  // Replace if same name exists, otherwise append
  const idx = existing.findIndex(
    p => p.baby_name.toLowerCase() === profile.baby_name.toLowerCase()
  );
  if (idx >= 0) existing[idx] = profile;
  else existing.push(profile);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
}

function deleteProfile(name: string) {
  const updated = loadProfiles().filter(
    p => p.baby_name.toLowerCase() !== name.toLowerCase()
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}

function ageLabel(weeks: number) {
  if (weeks === 0) return "Newborn";
  const m = Math.floor(weeks / 4);
  return m === 1 ? "1 month" : `${m} months`;
}

// Deterministic soft color per baby name
function avatarColor(name: string) {
  const colors = [
    ["#5DEDE4", "#1A2B47"],
    ["#F5C97A", "#2A1F0A"],
    ["#A78BFA", "#1E1A2B"],
    ["#FB923C", "#2A1608"],
    ["#34D399", "#0A2019"],
  ];
  const i = name.charCodeAt(0) % colors.length;
  return colors[i];
}

type Step = "pick" | "form";
const AGE_LABELS = ["Newborn", "6mo", "12mo", "18mo", "24mo"];

export function Onboarding({ onComplete, isLoading = false, error = null }: Props) {
  const [step, setStep] = useState<Step>("pick");
  const [profiles, setProfiles] = useState<BabyProfile[]>([]);
  const [name, setName] = useState("");
  const [ageMonths, setAgeMonths] = useState(1);
  const [weightKg, setWeightKg] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [selectingName, setSelectingName] = useState<string | null>(null);

  useEffect(() => {
    const saved = loadProfiles();
    setProfiles(saved);
    // Skip picker if no saved profiles
    if (saved.length === 0) setStep("form");
  }, []);

  const handleSelect = (profile: BabyProfile) => {
    setSelectingName(profile.baby_name);
    onComplete(profile);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const profile: BabyProfile = {
      baby_name: name.trim(),
      age_weeks: ageMonths * 4,
      weight_kg: weightKg ? parseFloat(weightKg) : undefined,
      conditions: [],
    };
    saveProfile(profile);
    onComplete(profile);
  };

  const handleDelete = (profileName: string) => {
    deleteProfile(profileName);
    const updated = loadProfiles();
    setProfiles(updated);
    setDeleteTarget(null);
    if (updated.length === 0) setStep("form");
  };

  return (
    <div
      className="relative min-h-screen flex items-center justify-center overflow-hidden"
      style={{ background: "var(--night)" }}
    >
      {/* Ambient orbs */}
      <div
        className="bg-orb w-[500px] h-[500px]"
        style={{
          background: "radial-gradient(circle, rgba(93,237,228,0.05), transparent 70%)",
          top: "-80px", right: "-60px",
          animation: "float-slow 9s ease-in-out infinite",
        }}
      />
      <div
        className="bg-orb w-[380px] h-[380px]"
        style={{
          background: "radial-gradient(circle, rgba(245,201,122,0.05), transparent 70%)",
          bottom: "-60px", left: "-40px",
          animation: "float-slow 11s ease-in-out infinite reverse",
        }}
      />

      <AnimatePresence mode="wait">

        {/* ── Profile picker ── */}
        {step === "pick" && (
          <motion.div
            key="pick"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, x: -32 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-10 w-full max-w-sm px-6"
          >
            {/* Header */}
            <div className="flex items-center gap-3 mb-8">
              <div
                className="relative w-8 h-8 rounded-full shrink-0"
                style={{
                  background: "radial-gradient(circle at 35% 35%, var(--teal), #1A2B47)",
                  boxShadow: "0 0 14px rgba(93,237,228,0.25)",
                }}
              >
                <div
                  className="absolute top-[3px] right-[3px] rounded-full w-[18px] h-[18px]"
                  style={{ background: "var(--night)" }}
                />
              </div>
              <div>
                <h1
                  className="font-display text-xl font-light leading-none"
                  style={{ color: "var(--cream)" }}
                >
                  BabyGuide <span className="italic" style={{ color: "var(--teal)" }}>AI</span>
                </h1>
                <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                  Who are we helping today?
                </p>
              </div>
            </div>

            {/* Saved profile cards */}
            <div className="space-y-2 mb-4">
              {profiles.map((profile, i) => {
                const [fg, bg] = avatarColor(profile.baby_name);
                const isDeleting = deleteTarget === profile.baby_name;

                return (
                  <motion.div
                    key={profile.baby_name}
                    initial={{ opacity: 0, x: -16 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.07 }}
                    className="relative"
                  >
                    <AnimatePresence>
                      {isDeleting ? (
                        <motion.div
                          key="confirm"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="flex items-center justify-between px-4 py-3 rounded-2xl"
                          style={{
                            background: "rgba(255,123,107,0.12)",
                            border: "1px solid rgba(255,123,107,0.3)",
                          }}
                        >
                          <span className="text-xs" style={{ color: "var(--coral)" }}>
                            Remove {profile.baby_name}?
                          </span>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setDeleteTarget(null)}
                              className="text-xs px-3 py-1 rounded-lg"
                              style={{ color: "var(--muted-light)", background: "var(--navy-mid)" }}
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleDelete(profile.baby_name)}
                              className="text-xs px-3 py-1 rounded-lg"
                              style={{ color: "var(--coral)", background: "rgba(255,123,107,0.15)" }}
                            >
                              Remove
                            </button>
                          </div>
                        </motion.div>
                      ) : (
                        <motion.button
                          key="card"
                          initial={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          onClick={() => !isLoading && handleSelect(profile)}
                          disabled={isLoading}
                          className="w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl text-left group transition-all disabled:opacity-60"
                          style={{
                            background: "var(--navy-mid)",
                            border: "1px solid rgba(93,237,228,0.08)",
                          }}
                          onMouseEnter={e => {
                            (e.currentTarget as HTMLElement).style.borderColor = "rgba(93,237,228,0.25)";
                            (e.currentTarget as HTMLElement).style.background = "var(--navy-light)";
                          }}
                          onMouseLeave={e => {
                            (e.currentTarget as HTMLElement).style.borderColor = "rgba(93,237,228,0.08)";
                            (e.currentTarget as HTMLElement).style.background = "var(--navy-mid)";
                          }}
                        >
                          {/* Avatar circle */}
                          <div
                            className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-base font-semibold"
                            style={{ background: bg, color: fg, border: `1.5px solid ${fg}30` }}
                          >
                            {profile.baby_name[0].toUpperCase()}
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate" style={{ color: "var(--cream)" }}>
                              {profile.baby_name}
                            </p>
                            <p className="text-xs" style={{ color: "var(--muted)" }}>
                              {ageLabel(profile.age_weeks)}
                              {profile.weight_kg ? ` · ${profile.weight_kg}kg` : ""}
                            </p>
                          </div>

                          {/* Chevron / spinner */}
                          {isLoading && selectingName === profile.baby_name ? (
                            <div
                              className="shrink-0 w-4 h-4 rounded-full border-2 animate-spin"
                              style={{ borderColor: "var(--teal)", borderTopColor: "transparent" }}
                            />
                          ) : (
                            <svg
                              className="shrink-0 opacity-0 group-hover:opacity-60 transition-opacity"
                              width="16" height="16" viewBox="0 0 16 16" fill="none"
                            >
                              <path d="M6 3l5 5-5 5" stroke="var(--teal)" strokeWidth="1.5"
                                strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}

                          {/* Delete button */}
                          <button
                            onClick={e => { e.stopPropagation(); setDeleteTarget(profile.baby_name); }}
                            className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-40 hover:!opacity-80 transition-opacity"
                            style={{ background: "rgba(255,123,107,0.15)" }}
                          >
                            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                              <path d="M1.5 1.5l7 7M8.5 1.5l-7 7"
                                stroke="var(--coral)" strokeWidth="1.5" strokeLinecap="round" />
                            </svg>
                          </button>
                        </motion.button>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </div>

            {/* Error on picker screen */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mb-3 px-4 py-3 rounded-xl text-xs leading-relaxed"
                  style={{
                    background: "rgba(255,123,107,0.12)",
                    border: "1px solid rgba(255,123,107,0.3)",
                    color: "var(--coral)",
                  }}
                >
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Add new baby button */}
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: profiles.length * 0.07 + 0.1 }}
              onClick={() => { setName(""); setAgeMonths(1); setWeightKg(""); setStep("form"); }}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-medium transition-all"
              style={{
                background: "transparent",
                border: "1px dashed rgba(93,237,228,0.25)",
                color: "var(--teal)",
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.background = "rgba(93,237,228,0.06)";
                (e.currentTarget as HTMLElement).style.borderColor = "rgba(93,237,228,0.45)";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.background = "transparent";
                (e.currentTarget as HTMLElement).style.borderColor = "rgba(93,237,228,0.25)";
              }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              Add new baby
            </motion.button>

            <p className="text-center text-xs mt-6" style={{ color: "var(--muted)" }}>
              Always consult your pediatrician for medical decisions.
            </p>
          </motion.div>
        )}

        {/* ── New profile form ── */}
        {step === "form" && (
          <motion.div
            key="form"
            initial={{ opacity: 0, x: 32 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-10 w-full max-w-sm px-6"
          >
            {/* Back button — only show if there are saved profiles */}
            {profiles.length > 0 && (
              <button
                onClick={() => setStep("pick")}
                className="mb-8 flex items-center gap-1.5 text-xs transition"
                style={{ color: "var(--muted-light)" }}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M9 11L5 7l4-4" stroke="currentColor" strokeWidth="1.4"
                    strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Back
              </button>
            )}

            <h2 className="font-display text-3xl font-light mb-1" style={{ color: "var(--cream)" }}>
              New baby
            </h2>
            <h2 className="font-display text-3xl font-light italic mb-8" style={{ color: "var(--teal)" }}>
              profile
            </h2>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Name */}
              <div>
                <label
                  className="block text-xs font-medium mb-2 tracking-widest uppercase"
                  style={{ color: "var(--muted-light)" }}
                >
                  Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Emma"
                  autoFocus
                  className="w-full px-4 py-3.5 rounded-xl text-sm outline-none transition"
                  style={{
                    background: "var(--navy-mid)",
                    border: "1px solid rgba(93,237,228,0.15)",
                    color: "var(--cream)",
                  }}
                  onFocus={e => (e.currentTarget.style.borderColor = "rgba(93,237,228,0.45)")}
                  onBlur={e => (e.currentTarget.style.borderColor = "rgba(93,237,228,0.15)")}
                />
              </div>

              {/* Age slider */}
              <div>
                <div className="flex justify-between items-baseline mb-3">
                  <label
                    className="text-xs font-medium tracking-widest uppercase"
                    style={{ color: "var(--muted-light)" }}
                  >
                    Age
                  </label>
                  <span className="font-display text-lg" style={{ color: "var(--amber)" }}>
                    {ageMonths === 0 ? "Newborn" : `${ageMonths} month${ageMonths !== 1 ? "s" : ""}`}
                  </span>
                </div>
                <input
                  type="range" min={0} max={24} value={ageMonths}
                  onChange={e => setAgeMonths(parseInt(e.target.value))}
                />
                <div className="flex justify-between mt-2">
                  {AGE_LABELS.map(l => (
                    <span key={l} className="text-[10px]" style={{ color: "var(--muted)" }}>
                      {l}
                    </span>
                  ))}
                </div>
              </div>

              {/* Weight */}
              <div>
                <label
                  className="block text-xs font-medium mb-2 tracking-widest uppercase"
                  style={{ color: "var(--muted-light)" }}
                >
                  Weight (kg)
                  <span className="normal-case ml-1 font-normal" style={{ color: "var(--muted)" }}>
                    — optional
                  </span>
                </label>
                <input
                  type="number" value={weightKg} onChange={e => setWeightKg(e.target.value)}
                  placeholder="e.g. 5.2" step="0.1" min="0" max="20"
                  className="w-full px-4 py-3.5 rounded-xl text-sm outline-none transition"
                  style={{
                    background: "var(--navy-mid)",
                    border: "1px solid rgba(93,237,228,0.15)",
                    color: "var(--cream)",
                  }}
                  onFocus={e => (e.currentTarget.style.borderColor = "rgba(93,237,228,0.45)")}
                  onBlur={e => (e.currentTarget.style.borderColor = "rgba(93,237,228,0.15)")}
                />
              </div>

              {/* Error */}
              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="px-4 py-3 rounded-xl text-xs leading-relaxed"
                    style={{
                      background: "rgba(255,123,107,0.12)",
                      border: "1px solid rgba(255,123,107,0.3)",
                      color: "var(--coral)",
                    }}
                  >
                    {error}
                  </motion.div>
                )}
              </AnimatePresence>

              <button
                type="submit"
                disabled={!name.trim() || isLoading}
                className="w-full py-4 rounded-2xl font-medium text-base transition-all flex items-center justify-center gap-2"
                style={{
                  background: name.trim() && !isLoading ? "var(--teal)" : "var(--navy-light)",
                  color: name.trim() && !isLoading ? "var(--night)" : "var(--muted)",
                  cursor: name.trim() && !isLoading ? "pointer" : "not-allowed",
                }}
              >
                {isLoading ? (
                  <>
                    <div
                      className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin"
                      style={{ borderColor: "var(--muted)", borderTopColor: "transparent" }}
                    />
                    Starting…
                  </>
                ) : "Start session"}
              </button>
            </form>

            <p className="text-center text-xs mt-6" style={{ color: "var(--muted)" }}>
              Profile saved automatically for next time.
            </p>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}
