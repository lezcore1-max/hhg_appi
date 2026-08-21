import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/PageShell";
import { SectionCard } from "@/components/SectionCard";
import { chunking, guardrailLayers } from "@/lib/site-data";
import { ShieldCheck, Cpu, Layers, Zap } from "lucide-react";

export const Route = createFileRoute("/how-it-works")({
  head: () => ({
    meta: [
      { title: "How It Works · Architecture, Harness & Guardrails" },
      {
        name: "description",
        content:
          "Multi-strategy chunking, ONNX embeddings, 3-tier model harness, and 4-layer guardrails stopping hallucinations across 5 Indic languages.",
      },
      { property: "og:title", content: "How It Works · Architecture, Harness & Guardrails" },
      {
        property: "og:description",
        content:
          "Inside the sub-200ms voice RAG pipeline: Sarvam STT, FAISS + BM25, Gemini 3.1 Flash Lite, harness telemetry, and hallucination guardrails.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HowItWorksPage,
});

function HowItWorksPage() {
  return (
    <PageShell
      eyebrow="Under the hood"
      title="Architecture & Defense."
      intro="Four chunking strategies, a 3-tier resilient model harness, and a 4-layer multi-lingual guardrail engine stopping hallucinations before they reach the user."
    >
      {/* Chunking Strategies (Task 2) */}
      <div className="mb-6 flex items-center gap-2">
        <Layers className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-bold text-card-foreground">1. Chunking Strategies</h2>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {chunking.map((c, i) => (
          <SectionCard key={c.name} index={String(i + 1).padStart(2, "0")} title={c.name}>
            <p>{c.note}</p>
          </SectionCard>
        ))}
      </div>

      {/* Model Harness (Task 5) */}
      <div className="mt-12 mb-6 flex items-center gap-2">
        <Cpu className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-bold text-card-foreground">2. Structured Model Harness (Task 5)</h2>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="grain rounded-lg border border-border bg-card p-6">
          <p className="label-mono text-primary">Tier 1: Streaming Fast LLM</p>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Gemini 3.1 Flash Lite with thinking budget = 0 for ultra-low TTFT (84ms) and live audio-synced streaming.
          </p>
        </div>
        <div className="grain rounded-lg border border-border bg-card p-6">
          <p className="label-mono text-primary">Tier 2: Resilient Retries & Fallback</p>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Asynchronous retry policy with exponential backoff and jitter, cascading to secondary preview model endpoints on transient API rate limits.
          </p>
        </div>
        <div className="grain rounded-lg border border-border bg-card p-6">
          <p className="label-mono text-primary">Tier 3: Local Extractive Fallback</p>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Zero-LLM instant extractive span resolver extracting grounded answers directly from top retrieved passages, guaranteeing 100% uptime within budget.
          </p>
        </div>
      </div>

      {/* 4-Layer Guardrails Architecture (Task 6) */}
      <div className="mt-12 mb-6 flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-bold text-card-foreground">3. 4-Layer Multi-Lingual Guardrails (Task 6)</h2>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {guardrailLayers.map((layer, i) => (
          <div key={layer.name} className="grain rounded-lg border border-border bg-card p-6">
            <p className="label-mono text-primary">{layer.name}</p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{layer.desc}</p>
          </div>
        ))}
      </div>

      {/* Multilingual Refusal Policy */}
      <div className="grain mt-8 rounded-lg border border-border bg-card p-6 sm:p-8">
        <p className="label-mono text-primary">Multilingual Refusal Policy</p>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          When an input is deemed unsafe, contains prompt injections, falls outside domain boundaries, or fails factual grounding, the engine cleanly refuses to answer in the speaker's native language rather than hallucinating:
        </p>
        <div className="mt-4 grid gap-2.5 sm:grid-cols-2 text-xs font-mono text-muted-foreground">
          <div className="rounded bg-secondary/50 p-3 border border-border/40">
            <span className="text-foreground font-semibold">Hindi: </span>
            <span>"क्षमा करें, आपके प्रश्न का उत्तर हमारे डेटाबेस में उपलब्ध नहीं है।"</span>
          </div>
          <div className="rounded bg-secondary/50 p-3 border border-border/40">
            <span className="text-foreground font-semibold">Marathi: </span>
            <span>"माफ करा, तुमच्या प्रश्नाचे उत्तर आमच्या डेटाबेसमध्ये उपलब्ध नाही."</span>
          </div>
          <div className="rounded bg-secondary/50 p-3 border border-border/40">
            <span className="text-foreground font-semibold">Punjabi: </span>
            <span>"ਮਾਫ਼ ਕਰਨਾ, ਤੁਹਾਡੇ ਸਵਾਲ ਦਾ ਜਵਾਬ ਸਾਡੇ ਡੇਟਾਬੇਸ ਵਿੱਚ ਉਪਲਬਧ ਨਹੀਂ ਹੈ।"</span>
          </div>
          <div className="rounded bg-secondary/50 p-3 border border-border/40">
            <span className="text-foreground font-semibold">Gujarati: </span>
            <span>"માફ કરશો, તમારા પ્રશ્નનો જવાબ અમારા ડેટાબેઝમાં ઉપલબ્ધ નથી."</span>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
