import type { AskAnswer, AskQuery } from "../../types";
import { qs, request } from "./client";

interface SuggestionsResponse {
  questions: string[];
  intents: string[];
  note: string;
}

export const askApi = {
  query: (payload: AskQuery) =>
    request<AskAnswer>("/assistant/query", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  suggestions: (limit = 6) =>
    request<SuggestionsResponse>(`/assistant/suggestions${qs({ limit })}`),
};
