import type { AskAnswer, AskQuery } from "../../types";
import { qs, request } from "./client";

interface SuggestionsResponse {
  questions: string[];
  intents: string[];
  note: string;
}

export interface AssistantProviderStatus {
  selected: string;
  fallback_available: boolean;
  primary: { available: boolean; provider: string; model?: string | null };
  secondary?: { available: boolean; provider: string; model?: string | null };
}

export const askApi = {
  query: (payload: AskQuery) =>
    request<AskAnswer>("/assistant/query", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  suggestions: (limit = 6) =>
    request<SuggestionsResponse>(`/assistant/suggestions${qs({ limit })}`),
  status: () => request<AssistantProviderStatus>("/assistant/status"),
};
