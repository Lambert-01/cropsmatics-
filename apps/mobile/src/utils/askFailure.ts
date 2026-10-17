/**
 * Why an Ask request produced no answer.
 *
 * The API client already classifies transport failures (`ApiError.kind`), but the
 * screen used to collapse every one of them into a fabricated, "unsupported"
 * `AskAnswer`. That told a user with no connection that Cropmatics had no
 * evidence for their question - a different, and wrong, statement.
 *
 * An `AskAnswer` therefore represents an answer; a transport problem is an
 * `AskFailure` and is rendered as one.
 */

import type { Strings } from "../i18n";
import { ApiError } from "../services/api/client";

export type AskFailureKind =
  | "offline"
  | "timeout"
  | "server"
  | "validation"
  | "unsupported"
  | "not_found"
  | "auth"
  | "unknown";

export interface AskFailure {
  kind: AskFailureKind;
  title: string;
  message: string;
  /** Whether repeating the same question could plausibly succeed. */
  retryable: boolean;
}

const API_KIND_TO_FAILURE: Record<ApiError["kind"], AskFailureKind> = {
  network: "offline",
  timeout: "timeout",
  server: "server",
  validation: "validation",
  unsupported: "unsupported",
  not_found: "not_found",
  auth: "auth",
  unknown: "unknown",
};

/**
 * Read the client's error kind defensively.
 *
 * `instanceof` fails when two copies of the client module end up in one runtime
 * (a bundling or test-double hazard), which would silently downgrade a clear
 * offline/timeout state to "unknown". The kind is a stable string contract, so it
 * is read directly and validated against the ones this screen understands.
 */
export function readApiErrorKind(error: unknown): ApiError["kind"] | null {
  if (error instanceof ApiError) return error.kind;
  if (error && typeof error === "object" && "kind" in error) {
    const kind = (error as { kind?: unknown }).kind;
    if (typeof kind === "string" && kind in API_KIND_TO_FAILURE) {
      return kind as ApiError["kind"];
    }
  }
  return null;
}

/**
 * Retry is offered where the same question could succeed on another attempt.
 * A question the platform genuinely cannot answer, or one it rejected as
 * malformed, is not a retry candidate - the user has to ask differently.
 */
const RETRYABLE: Record<AskFailureKind, boolean> = {
  offline: true,
  timeout: true,
  server: true,
  unknown: true,
  validation: false,
  unsupported: false,
  not_found: false,
  auth: false,
};

export function describeAskFailure(error: unknown, t: Strings): AskFailure {
  const apiKind = readApiErrorKind(error);
  const kind: AskFailureKind = apiKind ? API_KIND_TO_FAILURE[apiKind] : "unknown";

  const copy: Record<AskFailureKind, { title: string; message: string }> = {
    offline: { title: t.askErrorOfflineTitle, message: t.askErrorOfflineMessage },
    timeout: { title: t.askErrorTimeoutTitle, message: t.askErrorTimeoutMessage },
    server: { title: t.askErrorServerTitle, message: t.askErrorServerMessage },
    validation: { title: t.askErrorValidationTitle, message: t.askErrorValidationMessage },
    unsupported: { title: t.askErrorUnsupportedTitle, message: t.askErrorUnsupportedMessage },
    not_found: { title: t.askErrorNotFoundTitle, message: t.askErrorNotFoundMessage },
    auth: { title: t.authRequiredTitle, message: t.authRequiredMessage },
    unknown: { title: t.askErrorUnknownTitle, message: t.askErrorUnknownMessage },
  };

  return { kind, retryable: RETRYABLE[kind], ...copy[kind] };
}

/**
 * Product-level stages the Ask screen steps through while a single request is in
 * flight.
 *
 * `POST /assistant/query` is synchronous, so these are an indeterminate progress
 * cue driven on the client, not telemetry from the backend. They are worded as
 * in-progress work ("Checking…") rather than completed work, and they must never
 * be read as chain-of-thought, model reasoning, or evidence that a specific tool
 * ran.
 */
export function askProgressStages(t: Strings): string[] {
  return [
    t.askProgressUnderstanding,
    t.askProgressCheckingData,
    t.askProgressResolving,
    t.askProgressComparingPeriods,
    t.askProgressReviewingEvidence,
    t.askProgressPreparing,
  ];
}
