import type { InquiryInput, InquiryReceipt, InquiryStatus } from "../../types";
import { qs, request } from "./client";

export const inquiryApi = {
  topics: () => request<{ topics: string[] }>("/inquiries/topics"),
  submit: (payload: InquiryInput) =>
    request<InquiryReceipt>("/inquiries", { method: "POST", body: JSON.stringify(payload) }),
  /**
   * Read the status of your own inquiry. Requires the secret receipt token
   * issued at submission; a wrong token is indistinguishable from a missing
   * inquiry. There is deliberately no public listing endpoint.
   */
  status: (id: string, token: string) =>
    request<InquiryStatus>(`/inquiries/${encodeURIComponent(id)}/status${qs({ token })}`),
};
