import type { AskAnswer, AskQuery } from "../../types";
import { request } from "./client";

export const askApi = {
  query: (payload: AskQuery) =>
    request<AskAnswer>("/assistant/query", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};
