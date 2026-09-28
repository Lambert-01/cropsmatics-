"use client";

import { AlertTriangle, Loader2, ShieldCheck, Sparkles } from "lucide-react";
import { useState } from "react";

import { Card, CardHeader } from "@/components/ui/Card";
import { periodLabel } from "@/lib/format";
import { useAssistantMutation } from "@/services/hooks/useAnalytics";
import type { AssistantContext, AssistantResponse } from "@/types";

const DEFAULT_PROMPTS = [
  "Explain this yield pattern",
  "What data are missing for this selection?",
  "What should I investigate next?",
];

/**
 * Contextual grounded explanation (section 7).
 *
 * The action sends the page's selection as **structured context** — period, crop,
 * district, metric — so the assistant retrieves evidence for the same view the
 * user is looking at instead of defaulting to another release. The context names
 * entities only; it can never carry a value, and nothing here is scraped from
 * the DOM. Every answer renders its own source, period and limitations, and an
 * ungrounded answer is shown as such rather than paraphrased into confidence.
 */
export function AIExplainPanel({
  context,
  prompts = DEFAULT_PROMPTS,
  title = "Explain this with AI",
}: {
  context: AssistantContext;
  prompts?: string[];
  title?: string;
}) {
  const [question, setQuestion] = useState("");
  const assistant = useAssistantMutation();
  const result: AssistantResponse | undefined = assistant.data;

  const scope = [
    context.crop,
    context.district,
    context.period_code ? periodLabel(context.period_code) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const ask = (text: string) => {
    const value = text.trim();
    if (!value) return;
    setQuestion(value);
    assistant.mutate({ question: value, context });
  };

  return (
    <Card>
      <CardHeader
        title={title}
        subtitle="Grounded in the same selection shown above — the assistant explains, it never generates numbers"
      />

      <div className="px-4 pt-3">
        {scope ? (
          <p className="mb-2 text-[11px] text-slate-500">
            Context sent: <span className="font-medium text-slate-600">{scope}</span>
            {context.metric ? ` · metric: ${context.metric}` : ""}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-1.5">
          {prompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => ask(prompt)}
              disabled={assistant.isPending}
              className="rounded-full border border-forest/15 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-primary/40 hover:text-forest disabled:opacity-50"
            >
              {prompt}
            </button>
          ))}
        </div>

        <form
          className="mt-3 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            ask(question);
          }}
        >
          <label className="sr-only" htmlFor="yield-ai-question">
            Ask about this selection
          </label>
          <input
            id="yield-ai-question"
            className="input flex-1"
            placeholder="Ask about this selection…"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
          />
          <button
            type="submit"
            className="btn btn-primary"
            disabled={assistant.isPending || question.trim().length < 2}
          >
            {assistant.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            Ask
          </button>
        </form>
      </div>

      {assistant.isError ? (
        <p className="mx-4 mt-3 flex items-start gap-2 rounded-lg border border-danger/25 bg-danger/[0.04] p-3 text-xs text-slate-600">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger" aria-hidden="true" />
          The explanation service did not respond. The numbers above are unaffected.
        </p>
      ) : null}

      {result ? (
        <div className="mx-4 mt-3 mb-4 space-y-3 rounded-xl border border-forest/10 bg-forest/[0.02] p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                result.grounded
                  ? "bg-success/10 text-success"
                  : "bg-amber/10 text-amber"
              }`}
            >
              {result.grounded ? "Grounded" : "Not grounded"}
            </span>
            <span className="text-[10px] text-slate-400">intent: {result.intent}</span>
            {result.period ? (
              <span className="text-[10px] text-slate-400">
                period: {periodLabel(result.period)}
              </span>
            ) : null}
          </div>

          <p className="text-sm leading-relaxed text-slate-700">{result.answer}</p>

          {result.key_figures?.length ? (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Key figures
              </p>
              <dl className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-xs">
                {result.key_figures.map((figure, index) => (
                  <div key={`${figure.label}-${index}`}>
                    <dt className="text-[10px] uppercase tracking-wide text-slate-400">
                      {figure.label}
                    </dt>
                    <dd className="font-semibold tabular-nums text-forest-deep">
                      {figure.value?.toLocaleString("en-US", { maximumFractionDigits: 1 })}
                      {figure.unit ? <span className="ml-1 font-normal">{figure.unit}</span> : null}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}

          {result.source || result.coverage ? (
            <p className="flex items-start gap-1.5 text-[11px] text-slate-500">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
              <span>
                Source: {result.source ?? "not stated"}
                {result.coverage ? ` · coverage: ${result.coverage}` : ""}
              </span>
            </p>
          ) : null}

          {result.limitations?.length ? (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Limitations
              </p>
              <ul className="mt-1 ml-4 list-disc space-y-0.5 text-[11px] text-slate-500">
                {result.limitations.map((limitation) => (
                  <li key={limitation}>{limitation}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {Object.keys(result.evidence ?? {}).length ? (
            <details className="text-[11px] text-slate-500">
              <summary className="cursor-pointer font-medium text-slate-600">
                Evidence retrieved
              </summary>
              <pre className="mt-1 overflow-x-auto rounded-lg bg-white/70 p-2 text-[10px] leading-relaxed">
                {JSON.stringify(result.evidence, null, 2)}
              </pre>
            </details>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
