import type { InquiryInput, InquiryRecord } from "../../types";
import { request } from "./client";

export const inquiryApi = {
  submit: (payload: InquiryInput) =>
    request<InquiryRecord>("/inquiries", { method: "POST", body: JSON.stringify(payload) }),
  get: (id: string) => request<InquiryRecord>(`/inquiries/${id}`),
};
