// ─── Baby Profile ─────────────────────────────────────────────────────────────

export interface BabyProfile {
  baby_name: string;
  age_weeks: number;
  weight_kg?: number;
  conditions?: string[];
}

// ─── AR Overlay Types ─────────────────────────────────────────────────────────

export interface ArrowOverlay {
  type: "arrow";
  target_description: string;
  text: string;
  color: string;
  priority: number;
}

export interface HighlightBoxOverlay {
  type: "highlight_box";
  target_description: string;
  text: string;
  color: string;
  priority: number;
}

export interface ChecklistItem {
  label: string;
  hint: string;
  checked: boolean;
}

export interface ChecklistOverlay {
  type: "checklist";
  items: ChecklistItem[];
  priority: number;
}

export interface StepIndicatorOverlay {
  type: "step_indicator";
  current_step: number;
  total_steps: number;
  step_label: string;
  priority: number;
}

export interface InfoPanelOverlay {
  type: "info_panel";
  title: string;
  content: string;
  priority: number;
}

export type Overlay =
  | ArrowOverlay
  | HighlightBoxOverlay
  | ChecklistOverlay
  | StepIndicatorOverlay
  | InfoPanelOverlay;

// ─── WebSocket Messages ────────────────────────────────────────────────────────

export type ConnectionStatus =
  | "idle"
  | "connecting"
  | "ready"
  | "listening"
  | "speaking"
  | "error"
  | "disconnected";

export interface ServerMessage {
  type:
    | "session_ready"
    | "audio_chunk"
    | "text_response"
    | "annotations"
    | "interrupted"
    | "error";
  data?: string; // base64 audio
  text?: string;
  overlays?: Overlay[];
  message?: string;
}
