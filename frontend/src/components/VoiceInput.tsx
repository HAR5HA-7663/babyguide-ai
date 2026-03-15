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
  const analyserRef = useRef<AnalyserNode | null>(null);
  const bufferRef = useRef<Float32Array[]>([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [micLevel, setMicLevel] = useState(0); // 0–1

  const startCapture = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: TARGET_SAMPLE_RATE, channelCount: 1,
          echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;

      const audioCtx = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });
      audioContextRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);

      // Analyser for waveform visualisation
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.6;
      analyserRef.current = analyser;
      source.connect(analyser);

      // ScriptProcessor for PCM capture
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      processor.onaudioprocess = (e) => {
        bufferRef.current.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      };
      analyser.connect(processor);
      processor.connect(audioCtx.destination);

      setIsCapturing(true);
    } catch (err) {
      console.error("[VoiceInput] Mic error:", err);
    }
  }, []);

  const stopCapture = useCallback(() => {
    processorRef.current?.disconnect();
    audioContextRef.current?.close();
    streamRef.current?.getTracks().forEach(t => t.stop());
    processorRef.current = null;
    audioContextRef.current = null;
    streamRef.current = null;
    analyserRef.current = null;
    bufferRef.current = [];
    setIsCapturing(false);
    setMicLevel(0);
  }, []);

  // Flush PCM chunks
  useEffect(() => {
    if (!isActive || !isCapturing) return;
    const timer = setInterval(() => {
      if (bufferRef.current.length === 0) return;
      const totalLen = bufferRef.current.reduce((s, c) => s + c.length, 0);
      const merged = new Float32Array(totalLen);
      let offset = 0;
      for (const chunk of bufferRef.current) { merged.set(chunk, offset); offset += chunk.length; }
      bufferRef.current = [];
      const pcm = new Int16Array(merged.length);
      for (let i = 0; i < merged.length; i++) {
        pcm[i] = Math.max(-1, Math.min(1, merged[i])) * 0x7fff;
      }
      onAudioChunk(pcm.buffer);
    }, CHUNK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [isActive, isCapturing, onAudioChunk]);

  // Real-time mic level for waveform
  useEffect(() => {
    if (!isCapturing || !analyserRef.current) return;
    const analyser = analyserRef.current;
    const data = new Uint8Array(analyser.frequencyBinCount);
    let rafId = 0;

    const tick = () => {
      analyser.getByteTimeDomainData(data);
      // RMS of the waveform
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      setMicLevel(Math.min(1, Math.sqrt(sum / data.length) * 6));
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isCapturing]);

  useEffect(() => {
    if (isActive) startCapture(); else stopCapture();
  }, [isActive, startCapture, stopCapture]);

  return { isCapturing, micLevel };
}

// ─── Waveform component driven by real mic level ──────────────────────────────

export function AudioWaveform({ isActive, micLevel = 0 }: { isActive: boolean; micLevel?: number }) {
  // 5 bars with different phase offsets — when active, height scales with mic level
  const heights = isActive
    ? [0.3, 0.7, 1.0, 0.7, 0.3].map(scale => 3 + scale * micLevel * 18)
    : [3, 3, 3, 3, 3];

  return (
    <div className="flex items-center gap-[2.5px]" style={{ height: 22 }}>
      {heights.map((h, i) => (
        <div
          key={i}
          style={{
            width: 3,
            height: h,
            borderRadius: 3,
            background: isActive ? "var(--teal)" : "var(--muted)",
            opacity: isActive ? 0.9 : 0.3,
            transition: "height 0.08s ease",
          }}
        />
      ))}
    </div>
  );
}
