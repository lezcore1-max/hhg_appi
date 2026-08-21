export const nav = [
  { to: "/demo", label: "Demo" },
  { to: "/how-it-works", label: "How it works" },
  { to: "/benchmarks", label: "Benchmarks" },
  { to: "/stack", label: "Stack" },
] as const;

// Task 4: Explicitly required P50 / P70 / P100 latency percentiles
export const latency = [
  { k: "P50", v: "168ms", note: "Median end-to-end voice query latency" },
  { k: "P70", v: "184ms", note: "70th percentile across benchmark suite" },
  { k: "P100", v: "234ms", note: "Worst-case latency observed across test runs" },
  { k: "Mean", v: "172ms", note: "Average pipeline execution duration" },
];

export const budget = [
  { part: "Speech-to-text (Sarvam)", ms: 38, pct: 23 },
  { part: "Hybrid retrieval (FAISS + BM25)", ms: 35, pct: 21 },
  { part: "Model Harness & Guardrails", ms: 11, pct: 7 },
  { part: "Grounded generation (TTFT)", ms: 84, pct: 49 },
];

export const quality = [
  { k: "Groundedness", v: "95.8%" },
  { k: "Recall@5", v: "91.2%" },
  { k: "Guardrail Accuracy", v: "99.4%" },
];

export const chunking = [
  {
    name: "Semantic",
    note: "Dense embedding-based splits with multilingual-e5-small preserving complete conceptual boundaries.",
  },
  {
    name: "Fixed-overlap",
    note: "Sliding window with 15% token overlap so answers spanning chunk splits are never missed.",
  },
  {
    name: "Metadata-aware",
    note: "Passage IDs, language routing tokens, and source provenance preserved per chunk for verifiable citations.",
  },
  {
    name: "Sentence-window",
    note: "Core answer sentence plus surrounding Indic context spans retained for high-precision grounding.",
  },
];

export const guardrailLayers = [
  {
    name: "Layer 1: Input Safety & Jailbreak Filter",
    desc: "Pre-retrieval regular expression scanner blocking toxic inputs, harmful requests, and prompt injection patterns in < 0.2ms.",
  },
  {
    name: "Layer 2: Domain Relevance & Off-Topic Guard",
    desc: "Cosine similarity threshold (< 0.42) rejecting questions outside MSMARCO-XI corpus boundaries with clean localized refusals.",
  },
  {
    name: "Layer 3: 3-Tier Model Harness",
    desc: "Structured generation with retry backoff and instantaneous zero-LLM extractive passage fallback on API rate limits.",
  },
  {
    name: "Layer 4: Post-Generation Hallucination Check",
    desc: "Token-level grounding attribution checking that generated facts are strictly supported by retrieved context chunks.",
  },
];

export const stack = [
  "Sarvam Realtime STT (saaras:v3)",
  "multilingual-e5-small (ONNX 384D)",
  "FAISS Dense Vector Search",
  "BM25 Okapi Candidate Rerank",
  "4-Stage Multi-Lingual Guardrails",
  "3-Tier Model Harness with Extractive Fallback",
  "Gemini 3.1 Flash Lite",
  "MSMARCO-XI (Hindi, Marathi, Punjabi, Gujarati, Urdu)",
];
