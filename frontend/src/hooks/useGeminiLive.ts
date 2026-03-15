import { useCallback, useEffect, useRef, useState } from "react";
import { ConnectionStatus, Overlay, ServerMessage } from "../types";

const BACKEND_WS =
  import.meta.env.VITE_BACKEND_WS ?? `ws://${window.location.hostname}:8080`;

export interface GeminiLiveState {
  status: ConnectionStatus;
  lastText: string;
  overlays: Overlay[];
  error: string | null;
}

export interface GeminiLiveActions {
  connect: (sessionId: string) => void;
  disconnect: () => void;
  sendAudio: (pcmData: ArrayBuffer) => void;
  sendVideoFrame: (jpegData: ArrayBuffer) => void;
  sendText: (text: string) => void;
  interrupt: () => void;
}

export function useGeminiLive(
  onAudioChunk?: (data: ArrayBuffer) => void
): GeminiLiveState & GeminiLiveActions {
  const wsRef = useRef<WebSocket | null>(null);
  // Always call the LATEST onAudioChunk — avoids stale closure in ws.onmessage
  const onAudioChunkRef = useRef(onAudioChunk);
  useEffect(() => { onAudioChunkRef.current = onAudioChunk; }, [onAudioChunk]);

  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [lastText, setLastText] = useState("");
  const [overlays, setOverlays] = useState<Overlay[]>([]);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback((sessionId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setStatus("connecting");
    setError(null);

    const ws = new WebSocket(`${BACKEND_WS}/ws/${sessionId}`);
    wsRef.current = ws;

    ws.onopen = () => console.log("[GeminiLive] WS connected");

    ws.onmessage = (event) => {
      try {
        const msg: ServerMessage = JSON.parse(event.data);
        switch (msg.type) {
          case "session_ready":
            setStatus("ready");
            break;

          case "audio_chunk":
            if (msg.data) {
              const bytes = base64ToArrayBuffer(msg.data);
              onAudioChunkRef.current?.(bytes);  // always uses latest callback
              setStatus("speaking");
            }
            break;

          case "text_response":
            if (msg.text) setLastText(msg.text);
            break;

          case "annotations":
            if (msg.overlays) setOverlays(msg.overlays);
            break;

          case "interrupted":
            setStatus("listening");
            break;

          case "error":
            setError(msg.message ?? "Unknown error");
            setStatus("error");
            break;
        }
      } catch (e) {
        console.error("[GeminiLive] Parse error:", e);
      }
    };

    ws.onclose = (e) => {
      console.log("[GeminiLive] WS closed", e.code, e.reason);
      setStatus("disconnected");
      wsRef.current = null;
    };

    ws.onerror = (e) => {
      console.error("[GeminiLive] WS error:", e);
      setError("Connection failed");
      setStatus("error");
    };
  }, []); // no dependency on onAudioChunk — we use the ref instead

  const disconnect = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ type: "end_session" }));
    wsRef.current?.close();
    wsRef.current = null;
    setStatus("disconnected");
    setOverlays([]);
  }, []);

  const sendAudio = useCallback((pcmData: ArrayBuffer) => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: "audio_chunk", data: arrayBufferToBase64(pcmData) }));
    setStatus("listening");
  }, []);

  const sendVideoFrame = useCallback((jpegData: ArrayBuffer) => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: "video_frame", data: arrayBufferToBase64(jpegData) }));
  }, []);

  const sendText = useCallback((text: string) => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: "text_message", text }));
    setStatus("listening");
  }, []);

  const interrupt = useCallback(() => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: "interrupt" }));
    setStatus("listening");
  }, []);

  useEffect(() => () => { wsRef.current?.close(); }, []);

  return { status, lastText, overlays, error, connect, disconnect, sendAudio, sendVideoFrame, sendText, interrupt };
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
