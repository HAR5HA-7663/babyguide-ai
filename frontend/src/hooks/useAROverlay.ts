/**
 * useAROverlay — Canvas rendering hook for AR annotations.
 * Draws overlays on top of the video feed using the Canvas 2D API.
 */

import { useCallback, useRef } from "react";
import { Overlay } from "../types";

export function useAROverlay(canvasRef: React.RefObject<HTMLCanvasElement>) {
  const animFrameRef = useRef<number>(0);

  const render = useCallback(
    (overlays: Overlay[], videoEl: HTMLVideoElement | null) => {
      const canvas = canvasRef.current;
      if (!canvas || !videoEl) return;

      // Match canvas size to displayed video
      canvas.width = videoEl.clientWidth;
      canvas.height = videoEl.clientHeight;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      cancelAnimationFrame(animFrameRef.current);

      const drawFrame = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        for (const overlay of overlays) {
          switch (overlay.type) {
            case "arrow":
              drawArrowOverlay(ctx, overlay, canvas.width, canvas.height);
              break;
            case "highlight_box":
              drawHighlightBox(ctx, overlay, canvas.width, canvas.height);
              break;
            case "checklist":
              drawChecklist(ctx, overlay, canvas.width, canvas.height);
              break;
            case "step_indicator":
              drawStepIndicator(ctx, overlay, canvas.width, canvas.height);
              break;
            case "info_panel":
              drawInfoPanel(ctx, overlay, canvas.width, canvas.height);
              break;
          }
        }

        animFrameRef.current = requestAnimationFrame(drawFrame);
      };

      animFrameRef.current = requestAnimationFrame(drawFrame);
    },
    [canvasRef]
  );

  const clear = useCallback(() => {
    cancelAnimationFrame(animFrameRef.current);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
  }, [canvasRef]);

  return { render, clear };
}

// ─── Drawing helpers ──────────────────────────────────────────────────────────

function drawArrowOverlay(
  ctx: CanvasRenderingContext2D,
  overlay: { target_description: string; text: string; color: string },
  w: number,
  h: number
) {
  // Place arrow in lower-center area (actual target would require object detection)
  const cx = w * 0.5;
  const cy = h * 0.6;
  const color = overlay.color || "#4ADE80";

  // Animated pulse circle
  const t = Date.now() / 1000;
  const radius = 24 + Math.sin(t * 3) * 4;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.globalAlpha = 0.8;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();

  // Arrow pointing down
  drawArrow(ctx, cx, cy - 60, cx, cy - radius - 4, color, 3);

  // Label
  ctx.globalAlpha = 1;
  ctx.font = "bold 14px Inter, sans-serif";
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  const labelY = cy - 70;
  roundRect(ctx, cx - 80, labelY - 18, 160, 26, 6, "rgba(0,0,0,0.7)");
  ctx.fillStyle = color;
  ctx.fillText(overlay.text, cx, labelY - 1);
  ctx.restore();
}

function drawHighlightBox(
  ctx: CanvasRenderingContext2D,
  overlay: { target_description: string; text: string; color: string },
  w: number,
  h: number
) {
  const color = overlay.color || "#60A5FA";
  const bx = w * 0.3;
  const by = h * 0.35;
  const bw = w * 0.4;
  const bh = h * 0.3;

  const t = Date.now() / 1000;
  const alpha = 0.5 + Math.sin(t * 2) * 0.2;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.globalAlpha = alpha;
  ctx.setLineDash([8, 4]);
  ctx.strokeRect(bx, by, bw, bh);

  // Corner markers
  ctx.globalAlpha = 1;
  ctx.setLineDash([]);
  ctx.lineWidth = 4;
  const cs = 16;
  [[bx, by], [bx + bw, by], [bx, by + bh], [bx + bw, by + bh]].forEach(([x, y]) => {
    ctx.beginPath();
    ctx.moveTo(x - (x < bx + bw / 2 ? -cs : cs), y);
    ctx.lineTo(x, y);
    ctx.lineTo(x, y - (y < by + bh / 2 ? -cs : cs));
    ctx.stroke();
  });

  // Label
  ctx.font = "bold 13px Inter, sans-serif";
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  roundRect(ctx, bx + bw / 2 - 75, by - 30, 150, 24, 5, "rgba(0,0,0,0.7)");
  ctx.fillStyle = color;
  ctx.fillText(overlay.text, bx + bw / 2, by - 12);
  ctx.restore();
}

function drawChecklist(
  ctx: CanvasRenderingContext2D,
  overlay: { items: Array<{ label: string; hint: string; checked: boolean }> },
  w: number,
  h: number
) {
  const panelW = 220;
  const itemH = 44;
  const panelH = overlay.items.length * itemH + 44;
  const px = 16;
  const py = h / 2 - panelH / 2;

  ctx.save();
  roundRect(ctx, px, py, panelW, panelH, 12, "rgba(15,23,42,0.92)");

  ctx.font = "bold 13px Inter, sans-serif";
  ctx.fillStyle = "#60A5FA";
  ctx.textAlign = "left";
  ctx.fillText("Why is baby crying?", px + 12, py + 22);

  overlay.items.forEach((item, i) => {
    const iy = py + 44 + i * itemH;
    const checked = item.checked;

    // Checkbox
    ctx.strokeStyle = checked ? "#4ADE80" : "#64748B";
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 12, iy, 18, 18);
    if (checked) {
      ctx.strokeStyle = "#4ADE80";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(px + 15, iy + 9);
      ctx.lineTo(px + 18, iy + 13);
      ctx.lineTo(px + 26, iy + 5);
      ctx.stroke();
    }

    // Label
    ctx.font = `${checked ? "500" : "600"} 13px Inter, sans-serif`;
    ctx.fillStyle = checked ? "#64748B" : "#F1F5F9";
    ctx.fillText(item.label, px + 36, iy + 12);

    // Hint
    ctx.font = "11px Inter, sans-serif";
    ctx.fillStyle = "#94A3B8";
    ctx.fillText(item.hint, px + 36, iy + 26);
  });

  ctx.restore();
}

function drawStepIndicator(
  ctx: CanvasRenderingContext2D,
  overlay: { current_step: number; total_steps: number; step_label: string },
  w: number,
  h: number
) {
  const panelW = Math.min(320, w - 32);
  const px = (w - panelW) / 2;
  const py = h - 90;

  ctx.save();
  roundRect(ctx, px, py, panelW, 74, 12, "rgba(15,23,42,0.92)");

  // Progress dots
  const dotY = py + 22;
  const dotSpacing = Math.min(30, (panelW - 40) / overlay.total_steps);
  const dotsStart = px + (panelW - dotSpacing * (overlay.total_steps - 1)) / 2;

  for (let i = 0; i < overlay.total_steps; i++) {
    const dx = dotsStart + i * dotSpacing;
    ctx.beginPath();
    ctx.arc(dx, dotY, i < overlay.current_step ? 7 : 5, 0, Math.PI * 2);
    ctx.fillStyle = i < overlay.current_step ? "#4ADE80" : i === overlay.current_step - 1 ? "#60A5FA" : "#334155";
    ctx.fill();
  }

  // Step label
  ctx.font = "bold 14px Inter, sans-serif";
  ctx.fillStyle = "#F1F5F9";
  ctx.textAlign = "center";
  ctx.fillText(
    `Step ${overlay.current_step}/${overlay.total_steps}: ${overlay.step_label}`,
    px + panelW / 2,
    py + 54
  );

  ctx.restore();
}

function drawInfoPanel(
  ctx: CanvasRenderingContext2D,
  overlay: { title: string; content: string },
  w: number,
  h: number
) {
  const panelW = 220;
  const px = w - panelW - 16;
  const py = 16;

  ctx.save();
  roundRect(ctx, px, py, panelW, 80, 12, "rgba(15,23,42,0.92)");

  ctx.font = "bold 13px Inter, sans-serif";
  ctx.fillStyle = "#FB923C";
  ctx.textAlign = "left";
  ctx.fillText(overlay.title, px + 12, py + 22);

  ctx.font = "12px Inter, sans-serif";
  ctx.fillStyle = "#CBD5E1";
  // Word wrap content
  const words = overlay.content.split(" ");
  let line = "";
  let lineY = py + 42;
  for (const word of words) {
    const test = line + word + " ";
    if (ctx.measureText(test).width > panelW - 24 && line) {
      ctx.fillText(line, px + 12, lineY);
      line = word + " ";
      lineY += 16;
    } else {
      line = test;
    }
  }
  ctx.fillText(line, px + 12, lineY);

  ctx.restore();
}

// ─── Canvas utilities ─────────────────────────────────────────────────────────

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  w: number, h: number,
  r: number,
  fill: string
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  fromX: number, fromY: number,
  toX: number, toY: number,
  color: string,
  width: number
) {
  const headLen = 12;
  const dx = toX - fromX;
  const dy = toY - fromY;
  const angle = Math.atan2(dy, dx);

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;

  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(toX - headLen * Math.cos(angle - Math.PI / 6), toY - headLen * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(toX - headLen * Math.cos(angle + Math.PI / 6), toY - headLen * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
