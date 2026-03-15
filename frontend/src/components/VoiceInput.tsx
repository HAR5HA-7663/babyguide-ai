/**
 * VoiceInput — Mic capture, PCM resampling, and streaming to backend.
 * Uses Web Audio API to capture 16kHz mono PCM for Gemini.
 */

import { useCallback, useEffect, useRef, useState } from "react";

const TARGET_SAMPLE_RATE = 16000;
const CHUNK_INTERVAL_MS = 200;

interface Props {
  isActive: boolean;
  onAudioChunk: (pcmData: ArrayBuffer) => void;
  onInterrupt: () => void;
}

export function useVoiceInput({ isActive, onAudioChunk, onInterrupt }: Props) {
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const bufferRef = useRef<Float32Array[]>([]);
  const [isCapturing, setIsCapturing] = useState(false);

  const startCapture = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: TARGET_SAMPLE_RATE,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      streamRef.current = stream;

      const audioCtx = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });
      audioContextRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      // 4096-sample buffer, 1 input channel, 1 output channel
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        bufferRef.current.push(new Float32Array(inputData));
      };

      source.connect(processor);
      processor.connect(audioCtx.destination);

      setIsCapturing(true);
      console.log("[VoiceInput] Capture started");
    } catch (err) {
      console.error("[VoiceInput] Mic access failed:", err);
    }
  }, []);

  const stopCapture = useCallback(() => {
    processorRef.current?.disconnect();
    audioContextRef.current?.close();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    processorRef.current = null;
    audioContextRef.current = null;
    streamRef.current = null;
    bufferRef.current = [];
    setIsCapturing(false);
  }, []);

  // Flush audio buffer to parent at fixed intervals
  useEffect(() => {
    if (!isActive || !isCapturing) return;

    const timer = setInterval(() => {
      if (bufferRef.current.length === 0) return;

      // Concatenate all chunks
      const totalLen = bufferRef.current.reduce((s, c) => s + c.length, 0);
      const merged = new Float32Array(totalLen);
      let offset = 0;
      for (const chunk of bufferRef.current) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }
      bufferRef.current = [];

      // Convert Float32 → Int16 PCM
      const pcm = new Int16Array(merged.length);
      for (let i = 0; i < merged.length; i++) {
        const clamped = Math.max(-1, Math.min(1, merged[i]));
        pcm[i] = clamped * 0x7fff;
      }

      onAudioChunk(pcm.buffer);
    }, CHUNK_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [isActive, isCapturing, onAudioChunk]);

  useEffect(() => {
    if (isActive) {
      startCapture();
    } else {
      stopCapture();
    }
  }, [isActive, startCapture, stopCapture]);

  return { isCapturing };
}

// ─── Waveform visualizer component ───────────────────────────────────────────

export function AudioWaveform({ isActive }: { isActive: boolean }) {
  return (
    <div className="flex items-end gap-[3px] h-6">
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className={`w-[3px] rounded-full bg-green-400 transition-all ${
            isActive ? "wave-bar" : "h-1 opacity-30"
          }`}
          style={{ animationDelay: `${(i - 1) * 0.1}s` }}
        />
      ))}
    </div>
  );
}
