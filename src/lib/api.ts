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

/** Audio Blob → Sarvam STT → RAG answer */
export async function askVoice(audioBlob: Blob): Promise<AskResponse> {
  const form = new FormData();
  const ext = audioBlob.type.includes("mp4") ? "m4a" : audioBlob.type.includes("ogg") ? "ogg" : "webm";
  form.append("file", audioBlob, `recording.${ext}`);

  const res = await fetchWithTimeout(`${BACKEND_URL}/voice-ask`, {
    method: "POST",
    body: form,
  }, 25000);

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? "Voice backend error");
  }
  return res.json();
}
