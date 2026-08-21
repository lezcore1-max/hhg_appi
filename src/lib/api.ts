// Set VITE_BACKEND_URL in .env.local for dev, or in Vercel env vars for production
const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL ?? "http://localhost:8000").replace(/\/$/, "");

export interface GuardrailReport {
  passed: boolean;
  reason: string;
  checks: {
    safety: "PASS" | "FAIL";
    prompt_injection: "PASS" | "FAIL";
    domain_relevance: "PASS" | "FAIL";
    grounding_verification: string;
    hallucination_check: "PASS" | "FAIL";
  };
}

export interface HarnessTelemetry {
  model_tier?: string;
  model_name?: string;
  retries_count?: number;
  tool_calls?: Array<{
    tool: string;
    inputs: Record<string, any>;
    output_count?: number;
    top_doc_id?: string;
  }>;
  stage_durations_ms?: Record<string, number>;
  fallback_used?: boolean;
  status?: string;
}

export interface AskResponse {
  query?: string;
  answer: string;
  status: string;
  language?: string;
  language_name?: string;
  transcript?: string;
  confidence?: number;
  match_quality?: string;
  raw_score?: number;
  semantic_sim?: number;
  claims?: Array<{ statement: string; passage_citation_id: string }>;
  cited_chunk_ids?: string[];
  retrieved_context?: {
    matched_question?: string;
    query?: string;
    answer: string;
    chunk_text?: string;
    passage?: string;
    chunk_id?: string;
    passage_id?: string;
    query_id?: string;
    strategy?: string;
    score?: number;
    language?: string;
  }[];
  guardrails?: GuardrailReport;
  harness_telemetry?: HarnessTelemetry;
  total_latency_ms?: number;
  total_pipeline_latency_ms?: number;
  latency_ms?: number;
  stt_latency_ms?: number;
  retrieval_latency_ms?: number;
  rerank_latency_ms?: number;
  llm_latency_ms?: number;
}

export interface BenchmarkReport {
  timestamp: string;
  total_queries_tested: number;
  latency_percentiles: {
    p50_ms: number;
    p70_ms: number;
    p90_ms: number;
    p95_ms: number;
    p100_ms: number;
    mean_ms: number;
    min_ms: number;
  };
  stage_percentiles: {
    stt: Record<string, number>;
    retrieval: Record<string, number>;
    harness_and_guardrails?: Record<string, number>;
    llm_generation_ttft: Record<string, number>;
  };
  time_budget: Array<{
    part: string;
    ms: number;
    pct: number;
  }>;
  quality_metrics: {
    groundedness_rate: string;
    recall_at_5: string;
    guardrail_accuracy: string;
  };
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
export async function askText(query: string, lang?: string): Promise<AskResponse> {
  const res = await fetchWithTimeout(`${BACKEND_URL}/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, lang }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? "Backend error");
  }
  return res.json();
}

/** Fetch live latency benchmark metrics */
export async function fetchBenchmarks(): Promise<BenchmarkReport> {
  const res = await fetchWithTimeout(`${BACKEND_URL}/benchmarks`, {
    method: "GET",
  });
  if (!res.ok) {
    throw new Error("Failed to fetch benchmarks.");
  }
  return res.json();
}

/** Trigger on-demand benchmark evaluation run */
export async function triggerBenchmarkRun(): Promise<BenchmarkReport> {
  const res = await fetchWithTimeout(`${BACKEND_URL}/benchmarks/run`, {
    method: "POST",
  }, 45000);
  if (!res.ok) {
    throw new Error("Failed to execute benchmark evaluation.");
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Realtime Streaming STT via Sarvam WebSocket API
// Routed through backend /ws/sarvam proxy (API key stays server-side)
// ---------------------------------------------------------------------------

/** Build a WebSocket URL from the backend HTTP(S) URL. */
function backendWsUrl(path: string): string {
  const proto = BACKEND_URL.startsWith("https") ? "wss" : "ws";
  return `${proto}://${new URL(BACKEND_URL).host}${path}`;
}

/**
 * Convert browser AudioContext samples to base64-encoded 16 kHz linear16 PCM.
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
