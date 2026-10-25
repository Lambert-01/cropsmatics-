"use client";

import { Bot, CheckCircle2, Send, ShieldAlert, UserRound } from "lucide-react";
import { useState } from "react";

import { Card, CardHeader } from "@/components/ui/Card";
import { PageHeading } from "@/components/ui/PageHeading";
import { ErrorState } from "@/components/ui/States";
import { cn } from "@/lib/cn";
import { useAssistant } from "@/services/hooks/useReference";
import type { AssistantResponse, AssistantStructured } from "@/types";

interface Turn {
  role: "user" | "assistant";
  text: string;
  grounded?: boolean;
  /** Legacy flat evidence, kept for responses without a structured payload. */
  evidence?: Record<string, unknown>;
  structured?: AssistantStructured;
  warnings?: string[];
  answerMode?: AssistantResponse["answer_mode"];
}

const EXAMPLES = [
  "Which districts have the largest maize productivity gaps?",
  "Which factors are most strongly associated with maize yield?",
  "Compare Ngoma and Gatsibo.",
  "Which crops have the highest post-harvest loss shares?",
  "Why is this district ranked as high priority?",
];

/** A figure rendered with the period and unit the API published it under. */
function formatFigure(value: number | string | undefined, unit?: string | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return String(value ?? "—");
  const digits = Math.abs(value) >= 1000 ? 0 : Math.abs(value) >= 100 ? 1 : Math.abs(value) >= 10 ? 2 : 3;
  const text = value.toLocaleString(undefined, { maximumFractionDigits: digits });
  return unit ? `${text} ${unit}` : text;
}

export default function AssistantPage() {
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const assistant = useAssistant();

  const ask = async (text: string) => {
    const q = text.trim();
    if (!q || assistant.isPending) return;
    setTurns((t) => [...t, { role: "user", text: q }]);
    setQuestion("");
    try {
      const res: AssistantResponse = await assistant.mutateAsync({
        question: q,
        conversationId: conversationId ?? undefined,
      });
      // Adopt the server's conversation id so the next turn is a real follow-up.
      if (res.conversation_id) setConversationId(res.conversation_id);
      setTurns((t) => [
        ...t,
        {
          role: "assistant",
          text: res.answer,
          grounded: res.grounded,
          evidence: res.evidence,
          structured: res.structured,
          warnings: res.warnings,
          answerMode: res.answer_mode,
        },
      ]);
    } catch (e) {
      setTurns((t) => [
        ...t,
        {
          role: "assistant",
          text: `I could not reach the analytics API, so I will not answer: ${(e as Error).message}`,
          grounded: false,
        },
      ]);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeading
        title="AI Assistant"
        subtitle="Ask in plain language. Cropmatics answers from published evidence and explains what is missing."
      />

      <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
        <Card className="flex min-h-[32rem] flex-col">
          <CardHeader
            title="Cropmatics Assistant"
            subtitle="A conversational layer over the verified analytics"
          />

          <div className="thin-scroll flex-1 space-y-4 overflow-y-auto px-4 py-4">
            {turns.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 py-12 text-center">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Bot className="h-5 w-5" aria-hidden="true" />
                </span>
                <p className="text-sm font-medium text-forest">Ask about the data</p>
                <p className="max-w-sm text-xs text-slate-500">
                  The assistant resolves a district and crop, reads validated analytics, and answers
                  from those values only.
                </p>
              </div>
            ) : (
              turns.map((turn, i) => (
                <div
                  key={i}
                  className={cn("flex gap-2", turn.role === "user" ? "justify-end" : "justify-start")}
                >
                  {turn.role === "assistant" ? (
                    <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                      <Bot className="h-4 w-4" aria-hidden="true" />
                    </span>
                  ) : null}
                  <div
                    className={cn(
                      "max-w-[85%] rounded-xl px-3 py-2 text-sm",
                      turn.role === "user"
                        ? "bg-primary text-white"
                        : "border border-forest/10 bg-white text-slate-700",
                    )}
                  >
                    {turn.role === "assistant" ? (
                      <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide">
                        {turn.answerMode === "conversational" ? (
                          <span className="text-primary">Assistant</span>
                        ) : turn.grounded ? (
                          <span className="flex items-center gap-1 text-success">
                            <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> Verified answer
                          </span>
                        ) : (
                          <span className="text-amber">Data unavailable</span>
                        )}
                      </div>
                    ) : null}
                    <p className="whitespace-pre-wrap">{turn.text}</p>

                    {turn.role === "assistant" && turn.structured ? (
                      <StructuredDetails structured={turn.structured} onFollowUp={ask} />
                    ) : null}

                    {turn.role === "assistant" && !turn.structured && turn.evidence ? (
                      <div className="mt-2 rounded-lg bg-forest/[0.04] p-2 text-[11px] text-slate-600">
                        <p className="font-semibold text-forest">Evidence used</p>
                        <ul className="mt-1 space-y-0.5">
                          {Object.entries(turn.evidence).map(([k, v]) => (
                            <li key={k} className="flex justify-between gap-2">
                              <span className="text-slate-500">{k}</span>
                              <span className="tabular-nums">{String(v)}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {turn.role === "assistant" && turn.warnings?.length
                      ? turn.warnings.map((w) => (
                          <p
                            key={w}
                            className="mt-2 flex items-start gap-1 text-[11px] text-amber"
                          >
                            <ShieldAlert className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                            <span>{w}</span>
                          </p>
                        ))
                      : null}

                    {turn.role === "assistant" && turn.grounded === false && turn.answerMode !== "conversational" ? (
                      <p className="mt-2 flex items-center gap-1 text-[11px] text-amber">
                        <ShieldAlert className="h-3 w-3" aria-hidden="true" /> Not grounded — answer
                        withheld rather than guessed.
                      </p>
                    ) : null}
                  </div>
                  {turn.role === "user" ? (
                    <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-forest/10 text-forest">
                      <UserRound className="h-4 w-4" aria-hidden="true" />
                    </span>
                  ) : null}
                </div>
              ))
            )}
            {assistant.isPending ? (
              <p className="text-xs text-slate-400">Retrieving validated analytics…</p>
            ) : null}
          </div>

          <form
            className="border-t border-forest/10 p-3"
            onSubmit={(e) => {
              e.preventDefault();
              ask(question);
            }}
          >
            <label htmlFor="assistant-input" className="sr-only">
              Ask a question
            </label>
            <div className="relative">
              <textarea
                id="assistant-input"
                rows={1}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    ask(question);
                  }
                }}
                placeholder="Ask about crops, districts, gaps or trends"
                aria-keyshortcuts="Enter"
                className="input min-h-[2.75rem] w-full resize-none pr-12"
              />
              <button
                type="submit"
                className="absolute bottom-1.5 right-1.5 grid h-8 w-8 place-items-center rounded-lg bg-primary text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={assistant.isPending || !question.trim()}
                aria-label="Send question"
                title="Send question"
              >
                <Send className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </form>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Example questions" subtitle="These map to real endpoints" />
            <ul className="space-y-1.5 px-4 pb-4 pt-3">
              {EXAMPLES.map((e) => (
                <li key={e}>
                  <button
                    type="button"
                    onClick={() => ask(e)}
                    className="w-full rounded-lg border border-forest/10 px-2.5 py-2 text-left text-xs text-slate-600 transition hover:border-primary/30 hover:bg-forest/[0.03]"
                  >
                    {e}
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHeader title="Guardrails" subtitle="How the answer stays honest" />
            <ul className="px-4 pb-4 pt-3 ml-4 list-disc space-y-1 text-xs text-slate-600">
              <li>Answers only from validated API results.</li>
              <li>Withholds an answer when a district or crop cannot be resolved.</li>
              <li>Always reports the source id, period and limitations.</li>
              <li>Never asserts causality from an association.</li>
              <li>Every figure is shown with the period and unit it was published under.</li>
            </ul>
          </Card>

          {assistant.error ? (
            <ErrorState message="The assistant endpoint did not respond." />
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * The structured half of an answer.
 *
 * Rendered from the API's typed fields rather than the prose, so a figure is
 * always paired with its period, unit and source, a truthfulness warning is
 * visible, and the follow-ups offered are ones the platform can actually ground.
 */
function StructuredDetails({
  structured,
  onFollowUp,
}: {
  structured: AssistantStructured;
  onFollowUp: (question: string) => void;
}) {
  const findings = structured.key_findings ?? [];
  const figures = structured.figures ?? [];
  const methodology = structured.methodology ?? [];
  const sources = structured.sources ?? [];
  const followups = structured.suggested_followups ?? [];
  const limitations = structured.limitations ?? [];
  const primarySources = sources.slice(0, 2);

  return (
    <div className="mt-2 space-y-2.5 text-[11px]">
      {findings.length ? (
        <ul className="ml-4 list-disc space-y-0.5 text-slate-600">
          {findings.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}

      {figures.length ? (
        <div className="rounded-lg bg-forest/[0.04] p-2">
          <p className="font-semibold text-forest">Key figures</p>
          <ul className="mt-1 space-y-1">
            {figures.map((figure, index) => (
              <li key={`${figure.label}-${index}`} className="flex justify-between gap-3">
                <span className="min-w-0">
                  <span className="text-slate-600">{figure.label}</span>
                  {figure.period_code || figure.crop || figure.district ? (
                    <span className="block text-[10px] text-slate-400">
                      {[figure.crop, figure.district, figure.period_code].filter(Boolean).join(" · ")}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 tabular-nums font-medium text-forest">
                  {formatFigure(figure.value, figure.unit)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {limitations.length ? (
        <details className="rounded-lg border border-forest/10 p-2">
          <summary className="cursor-pointer font-semibold text-forest">
            Data notes ({limitations.length})
          </summary>
          <ul className="mt-1 ml-4 list-disc space-y-0.5 text-slate-500">
            {limitations.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </details>
      ) : null}

      {methodology.length ? (
        <details className="rounded-lg border border-forest/10 p-2">
          <summary className="cursor-pointer font-semibold text-forest">Methodology</summary>
          <ul className="mt-1 ml-4 list-disc space-y-0.5 text-slate-500">
            {methodology.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </details>
      ) : null}

      {sources.length ? (
        <details className="rounded-lg border border-forest/10 p-2">
          <summary className="cursor-pointer font-semibold text-forest">
            Sources ({sources.length})
          </summary>
          <p className="mt-1 text-slate-500">
            {primarySources
              .map((s) => (s.name ? `${s.name} (${s.source_id})` : s.source_id))
              .join(", ")}
            {sources.length > primarySources.length ? " …" : ""}
          </p>
          {sources.length > primarySources.length ? (
            <ul className="mt-1 ml-4 list-disc space-y-0.5 text-slate-500">
              {sources.slice(2).map((s) => (
                <li key={s.source_id}>
                  {s.name ? `${s.name} (${s.source_id})` : s.source_id}
                </li>
              ))}
            </ul>
          ) : null}
        </details>
      ) : null}

      {followups.length ? (
        <div className="flex flex-wrap gap-1.5">
          {followups.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => onFollowUp(q)}
              className="rounded-full border border-forest/10 px-2.5 py-1 text-[11px] text-slate-600 transition hover:border-primary/30 hover:bg-forest/[0.03]"
            >
              {q}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
