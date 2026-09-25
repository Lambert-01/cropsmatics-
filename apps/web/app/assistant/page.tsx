"use client";

import { Bot, Send, ShieldAlert, UserRound } from "lucide-react";
import { useState } from "react";

import { Card, CardHeader } from "@/components/ui/Card";
import { PageHeading } from "@/components/ui/PageHeading";
import { ErrorState } from "@/components/ui/States";
import { cn } from "@/lib/cn";
import { useAssistant } from "@/services/hooks/useReference";

interface Turn {
  role: "user" | "assistant";
  text: string;
  grounded?: boolean;
  evidence?: Record<string, unknown>;
  limitations?: string[];
}

const EXAMPLES = [
  "Which districts have the largest maize productivity gaps?",
  "Which factors are most strongly associated with maize yield?",
  "Compare Ngoma and Gatsibo.",
  "Which crops have the highest post-harvest loss shares?",
  "Why is this district ranked as high priority?",
];

export default function AssistantPage() {
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const assistant = useAssistant();

  const ask = async (text: string) => {
    const q = text.trim();
    if (!q) return;
    setTurns((t) => [...t, { role: "user", text: q }]);
    setQuestion("");
    try {
      const res = await assistant.mutateAsync(q);
      setTurns((t) => [
        ...t,
        {
          role: "assistant",
          text: res.answer,
          grounded: res.grounded,
          evidence: res.evidence,
          limitations: res.limitations,
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
        subtitle="Answers are grounded in API results and cite their source. The assistant never invents numbers."
      />

      <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
        <Card className="flex min-h-[32rem] flex-col">
          <CardHeader
            title="Grounded Q&A"
            subtitle="Retrieval over the analytics layer — not a generative guess"
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
                  className={cn(
                    "flex gap-2",
                    turn.role === "user" ? "justify-end" : "justify-start",
                  )}
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
                    <p className="whitespace-pre-wrap">{turn.text}</p>
                    {turn.role === "assistant" && turn.evidence ? (
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
                    {turn.role === "assistant" && turn.grounded === false ? (
                      <p className="mt-2 flex items-center gap-1 text-[11px] text-amber">
                        <ShieldAlert className="h-3 w-3" aria-hidden="true" /> Not grounded — answer
                        withheld rather than guessed.
                      </p>
                    ) : null}
                    {turn.role === "assistant" && turn.limitations?.length ? (
                      <ul className="mt-2 ml-4 list-disc text-[11px] text-slate-500">
                        {turn.limitations.map((l) => (
                          <li key={l}>{l}</li>
                        ))}
                      </ul>
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
            className="flex items-end gap-2 border-t border-forest/10 p-3"
            onSubmit={(e) => {
              e.preventDefault();
              ask(question);
            }}
          >
            <label htmlFor="assistant-input" className="sr-only">
              Ask a question
            </label>
            <textarea
              id="assistant-input"
              rows={1}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g. Why is maize yield low in Gasabo?"
              className="input max-h-32 min-h-[2.5rem] flex-1 resize-none"
            />
            <button type="submit" className="btn btn-primary" disabled={assistant.isPending}>
              <Send className="h-4 w-4" /> Ask
            </button>
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
