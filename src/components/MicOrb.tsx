import { useRef, useState, useCallback, useEffect } from "react";
import { Mic, Square, Loader2 } from "lucide-react";
import { askText, streamStt, type AskResponse } from "@/lib/api";

type Stage = "idle" | "recording" | "processing";

interface MicOrbProps {
  onResult?: (result: AskResponse) => void;
  onError?: (msg: string) => void;
  onPartialTranscript?: (text: string) => void;
}

export function MicOrb({ onResult, onError, onPartialTranscript }: MicOrbProps) {
  const [stage, setStage] = useState<Stage>("idle");
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const procRef = useRef<ScriptProcessorNode | null>(null);
  const srcRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const sttRef = useRef<{ promise: Promise<string>; stop: () => void } | null>(null);
  const autoStopTimerRef = useRef<NodeJS.Timeout | null>(null);

  const onResultRef = useRef(onResult);
  const onErrorRef = useRef(onError);
  const onPartialTranscriptRef = useRef(onPartialTranscript);

  useEffect(() => {
    onResultRef.current = onResult;
    onErrorRef.current = onError;
    onPartialTranscriptRef.current = onPartialTranscript;
  }, [onResult, onError, onPartialTranscript]);

  const releaseMic = useCallback(() => {
    if (procRef.current) {
      try { procRef.current.disconnect(); } catch {}
      procRef.current = null;
    }
    if (srcRef.current) {
      try { srcRef.current.disconnect(); } catch {}
      srcRef.current = null;
    }
    if (audioCtxRef.current) {
      try { audioCtxRef.current.close(); } catch {}
      audioCtxRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => { try { t.stop(); } catch {} });
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (autoStopTimerRef.current) clearTimeout(autoStopTimerRef.current);
      releaseMic();
    };
  }, [releaseMic]);

  const stopRecording = useCallback(() => {
    if (autoStopTimerRef.current) {
      clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }

    if (sttRef.current) {
      sttRef.current.stop();
      sttRef.current = null;
      setStage("processing");
      return;
    }

    releaseMic();
    setStage("idle");
  }, [releaseMic]);

  const startRecording = useCallback(async () => {
    releaseMic();
    setStage("recording");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      const src = audioCtx.createMediaStreamSource(stream);
      srcRef.current = src;
      const proc = audioCtx.createScriptProcessor(4096, 1, 1);
      procRef.current = proc;
      src.connect(proc);
      proc.connect(audioCtx.destination);

      // Pass real-time transcript updates up
      const { promise: transcriptPromise, stop } = streamStt(
        proc,
        audioCtx.sampleRate,
        releaseMic,
        (partialText) => {
          onPartialTranscriptRef.current?.(partialText);
        }
      );
      sttRef.current = { promise: transcriptPromise, stop };

      autoStopTimerRef.current = setTimeout(() => {
        stopRecording();
      }, 12000);

      const transcript = await transcriptPromise;

      if (autoStopTimerRef.current) {
        clearTimeout(autoStopTimerRef.current);
        autoStopTimerRef.current = null;
      }

      if (!transcript.trim()) {
        setStage("idle");
        return;
      }

      setStage("processing");
      const result = await askText(transcript.trim());
      result.transcript = transcript.trim();
      onResultRef.current?.(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Voice processing error";
      onErrorRef.current?.(msg);
    } finally {
      releaseMic();
      sttRef.current = null;
      setStage("idle");
    }
  }, [releaseMic, stopRecording]);

  const handleClick = () => {
    if (stage === "idle") startRecording();
    else if (stage === "recording") stopRecording();
  };

  const ariaLabel =
    stage === "idle"
      ? "Tap to speak"
      : stage === "recording"
      ? "Stop recording"
      : "Processing…";

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={stage === "processing"}
      aria-label={ariaLabel}
      aria-pressed={stage === "recording"}
      className="group relative grid h-40 w-40 place-items-center rounded-full focus:outline-none cursor-pointer"
    >
      {stage === "recording" && (
        <>
          <span className="absolute inset-0 animate-ping rounded-full border-2 border-primary/60" />
          <span className="absolute -inset-4 animate-pulse rounded-full border border-primary/40" />
        </>
      )}
      <span
        className={`relative grid h-28 w-28 place-items-center rounded-full bg-primary transition-transform duration-300 group-hover:scale-105 ${
          stage === "recording" ? "shadow-[0_0_70px_20px_rgba(242,201,76,0.35)]" : ""
        } ${stage === "processing" ? "opacity-60" : ""}`}
      >
        {stage === "processing" ? (
          <Loader2 className="h-10 w-10 animate-spin text-primary-foreground" aria-hidden />
        ) : stage === "recording" ? (
          <Square className="h-10 w-10 text-primary-foreground" aria-hidden />
        ) : (
          <Mic className="h-10 w-10 text-primary-foreground" aria-hidden />
        )}
      </span>
    </button>
  );
}