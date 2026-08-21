// Set VITE_BACKEND_URL in .env.local for dev, or in Vercel env vars for production
const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL ?? "http://localhost:8000").replace(/\/$/, "");

export interface AskResponse {
  answer: string;
  status: string;
  transcript?: string;
  retrieved_context?: { matched_question?: string; query?: string; answer: string; chunk_text?: string; passage?: string; chunk_id?: string; passage_id?: string; query_id?: string; strategy?: string; score?: number }[];
  total_latency_ms?: number;
  total_pipeline_latency_ms?: number;
  latency_ms?: number;
  stt_latency_ms?: number;
  retrieval_latency_ms?: number;
  rerank_latency_ms?: number;
  llm_latency_ms?: number;
}

/** Helper with AbortController timeout */
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 20000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (err: unknown) {
    clearTimeout(id);
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Request timed out. Please try again.");
    }
    throw err;
  }
}

/** Text query → RAG answer */
export async function askText(query: string): Promise<AskResponse> {
  const res = await fetchWithTimeout(`${BACKEND_URL}/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? "Backend error");
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Realtime Streaming STT via Sarvam WebSocket API
// Routed through backend /ws/sarvam proxy (API key stays server-side)
// https://docs.sarvam.ai/api/api-guides-tutorials/speech-to-text/realtime-streaming
// ---------------------------------------------------------------------------

/** Build a WebSocket URL from the backend HTTP(S) URL. */
function backendWsUrl(path: string): string {
  const proto = BACKEND_URL.startsWith("https") ? "wss" : "ws";
  return `${proto}://${new URL(BACKEND_URL).host}${path}`;
}

/**
 * Convert browser AudioContext samples to base64-encoded 16 kHz linear16 PCM.
 *
 * @param input       Float32Array from ScriptProcessorNode (browser sample rate)
 * @param sourceRate  AudioContext.sampleRate (typically 44100 or 48000)
 */
export function toLinear16Base64(input: Float32Array, sourceRate: number): string {
  const targetRate = 16000;
  const ratio = sourceRate / targetRate;
  const outLen = Math.floor(input.length / ratio);
  const pcm = new Int16Array(outLen);

  for (let i = 0; i < outLen; i++) {
    const idx = Math.floor(i * ratio);
    const s = Math.max(-1, Math.min(1, input[idx]));
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }

  // Int16Array → raw bytes → base64
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Opens a WebSocket to Sarvam's Realtime Streaming STT and streams raw
 * linear16 PCM audio captured from the provided ScriptProcessorNode.
 *
 * The processor's `onaudioprocess` is set up internally to capture
 * float samples, resample to 16 kHz, encode as linear16, and stream
 * them to the WebSocket as `audio_input` events.
 *
 * Returns a promise that resolves with the final transcript text.
 *
 * @param processor  ScriptProcessorNode connected to the mic AudioContext
 * @param sourceRate AudioContext.sampleRate (for resampling to 16 kHz)
 * @param cleanup    Called when the utterance ends (stop processor, close ctx, release mic)
 */
export function streamStt(
  processor: ScriptProcessorNode,
  sourceRate: number,
  cleanup: () => void,
  onPartial?: (text: string) => void,
): { promise: Promise<string>; stop: () => void } {
  const params = new URLSearchParams({
    language_code: "auto",
    model: "saaras:v3-realtime",
    stream_type: "balanced",
    mode: "transcribe",
    endpointing: "vad",
    encoding: "linear16",
    sample_rate: "16000",
  });

  const ws = new WebSocket(`${backendWsUrl("/ws/sarvam")}?${params.toString()}`);
  let resolved = false;

  const doCleanup = () => {
    try { processor.disconnect(); } catch {}
    cleanup();
  };

  const promise = new Promise<string>((resolve, reject) => {
    ws.onopen = () => {
      ws.send(JSON.stringify({ event: "speech_start" }));

      processor.onaudioprocess = (e) => {
        if (ws.readyState !== WebSocket.OPEN) return;
        const inputData = e.inputBuffer.getChannelData(0);
        const b64 = toLinear16Base64(inputData, sourceRate);
        ws.send(JSON.stringify({ event: "audio_input", audio: b64 }));
      };
    };

    ws.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data as string);
        const text = data.text ?? data.transcript ?? "";

        // Handle live partial transcription
        if (data.event === "transcript.partial" || data.event === "transcript") {
          if (text && onPartial) {
            onPartial(text);
          }
        } else if (data.event === "transcript.final") {
          if (!resolved) {
            resolved = true;
            doCleanup();
            resolve(text);
          }
        } else if (data.event === "error") {
          if (!resolved) {
            resolved = true;
            doCleanup();
            reject(new Error(data.message ?? "Sarvam STT error"));
          }
        }
      } catch {
        // ignore non-JSON messages
      }
    };

    ws.onerror = () => {
      if (!resolved) {
        resolved = true;
        doCleanup();
        reject(new Error("Sarvam WebSocket connection failed"));
      }
    };

    ws.onclose = () => {
      if (!resolved) {
        resolved = true;
        doCleanup();
        resolve("");
      }
    };
  });

  return {
    promise,
    stop: () => {
      processor.onaudioprocess = null;
      if (ws.readyState === WebSocket.OPEN) {
        try { ws.send(JSON.stringify({ event: "speech_end" })); } catch {}
        setTimeout(() => {
          try { ws.close(1000); } catch {}
        }, 500);
      }
    },
  };
}
