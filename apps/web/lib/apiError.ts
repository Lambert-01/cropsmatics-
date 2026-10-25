/**
 * Typed API failures, and the sentence a user should read.
 *
 * The analytics API answers a *typed* 503 when the canonical database cannot
 * serve a read (`DATASET_OUT_OF_SYNC` / `DATABASE_UNAVAILABLE`, see
 * `docs/P0_DATABASE_AUTHORITY.md`). The web client used to collapse every
 * non-2xx into `API /x failed: 503 Service Unavailable`, so a reader saw a
 * transport error where the API had actually said, precisely, what was wrong -
 * and the panel then told them to start a local API with `make api`, which is
 * meaningless on the deployed site.
 *
 * This module keeps the status and the API's own `code` on the error object, and
 * renders one honest sentence: what is unavailable, that nothing is being shown
 * rather than something unverified, and whether retrying can help.
 */

/** The API error envelope documented in `docs/P0_DATABASE_AUTHORITY.md`. */
export interface ApiErrorBody {
  code?: string | null;
  detail?: string | null;
  message?: string | null;
  hint?: string | null;
  retryable?: boolean | null;
}

export class ApiFailure extends Error {
  /** HTTP status, or null when the request never reached the server. */
  readonly status: number | null;
  /** The API's machine-readable error code, when it sent one. */
  readonly code: string | null;
  /** Whether the API itself said a retry can help. */
  readonly retryable: boolean | null;
  /** The request path, for a developer-facing report. */
  readonly path: string;

  constructor(options: {
    path: string;
    status: number | null;
    code?: string | null;
    message: string;
    retryable?: boolean | null;
  }) {
    super(options.message);
    this.name = "ApiFailure";
    this.path = options.path;
    this.status = options.status;
    this.code = options.code ?? null;
    this.retryable = options.retryable ?? null;
  }
}

/**
 * The sentence shown in a panel's error state.
 *
 * Deliberately never says "0" or "no data": an unavailable service and a
 * published zero are different facts, and the difference is the whole point of
 * the canonical-mode contract.
 */
export function describeApiFailure(
  status: number | null,
  body: ApiErrorBody | null,
  statusText = "",
  path = "",
): { message: string; retryable: boolean } {
  const code = (body?.code ?? "").trim();

  if (status === null) {
    return {
      message:
        "The analytics service could not be reached. Figures are unavailable rather than shown as zero.",
      retryable: true,
    };
  }

  if (status === 503) {
    if (path.endsWith("/context/weather")) {
      return {
        message:
          "Weather context is temporarily unavailable because the external provider is rate-limited. The crop analytics remain unchanged; try again shortly.",
        retryable: true,
      };
    }
    if (code === "DATASET_OUT_OF_SYNC") {
      return {
        message:
          "The analytics service is bringing its published dataset back in step with this release, so these figures are withheld instead of being shown from a mismatched build. Try again in a few minutes.",
        retryable: true,
      };
    }
    if (code === "DATABASE_UNAVAILABLE") {
      return {
        message:
          "The analytics database is temporarily unavailable, so these figures cannot be verified right now. Nothing is shown rather than an unverified value.",
        retryable: true,
      };
    }
    return {
      message:
        "The analytics service is temporarily unavailable, so these figures cannot be loaded right now. This is a service problem, not an empty result.",
      retryable: true,
    };
  }

  if (status === 429) {
    return {
      message: "Too many requests were sent to the analytics service. Wait a moment and retry.",
      retryable: true,
    };
  }

  if (status >= 500) {
    return {
      message: `The analytics service failed to answer (HTTP ${status}${
        statusText ? ` ${statusText}` : ""
      }). This is a service problem, not a verified empty result.`,
      retryable: true,
    };
  }

  if (status === 404) {
    return {
      message:
        body?.detail ??
        "This dataset or selection is not published by the analytics service.",
      retryable: false,
    };
  }

  if (status === 422) {
    return {
      message:
        body?.detail ??
        "That selection is not supported by this dataset. Adjust the filters and try again.",
      retryable: false,
    };
  }

  const detail = body?.detail ?? body?.message ?? null;
  return {
    message: detail
      ? String(detail)
      : `The analytics service rejected the request (HTTP ${status}).`,
    retryable: false,
  };
}

/** Read the error envelope from a response, tolerating a non-JSON body. */
export async function readErrorBody(response: Response): Promise<ApiErrorBody | null> {
  try {
    const body = await response.json();
    if (body && typeof body === "object") return body as ApiErrorBody;
    return null;
  } catch {
    return null;
  }
}
