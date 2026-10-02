import { describe, expect, it, vi } from "vitest";

/**
 * Ask transport classification.
 *
 * The defect these guard: the Ask screen caught every failure with a single
 * generic handler and rendered it as an `AskAnswer` with `grounded: false` and
 * `intent: "unsupported"`. An offline device was therefore told that Cropmatics
 * had no verified evidence for its question, and the user had no way to retry.
 */
import { en, rw } from "../src/i18n";
import {
  ApiError,
  NetworkError,
  NotFoundError,
  ServerError,
  TimeoutError,
  UnsupportedDataError,
  ValidationError,
} from "../src/services/api/client";
import { askProgressStages, describeAskFailure, readApiErrorKind } from "../src/utils/askFailure";

// The client reads `expo-constants` at import time; vitest hoists this mock.
vi.mock("expo-constants", () => ({
  default: { expoConfig: { extra: {} } },
}));

describe("describeAskFailure", () => {
  it("maps each typed client error to its own state", () => {
    expect(describeAskFailure(new NetworkError(), en).kind).toBe("offline");
    expect(describeAskFailure(new TimeoutError(), en).kind).toBe("timeout");
    expect(describeAskFailure(new ServerError(), en).kind).toBe("server");
    expect(describeAskFailure(new ValidationError(), en).kind).toBe("validation");
    expect(describeAskFailure(new UnsupportedDataError(), en).kind).toBe("unsupported");
    expect(describeAskFailure(new NotFoundError(), en).kind).toBe("not_found");
    expect(describeAskFailure(new ApiError("unknown", "boom"), en).kind).toBe("unknown");
  });

  it("keeps a server failure distinguishable from an unsupported question", () => {
    const server = describeAskFailure(new ServerError(), en);
    const unsupported = describeAskFailure(new UnsupportedDataError(), en);

    expect(server.title).not.toBe(unsupported.title);
    expect(server.message).not.toBe(unsupported.message);
    expect(server.retryable).toBe(true);
    expect(unsupported.retryable).toBe(false);
  });

  it("offers retry only where retrying could work", () => {
    expect(describeAskFailure(new NetworkError(), en).retryable).toBe(true);
    expect(describeAskFailure(new TimeoutError(), en).retryable).toBe(true);
    expect(describeAskFailure(new ServerError(), en).retryable).toBe(true);
    expect(describeAskFailure(new Error("unexpected"), en).retryable).toBe(true);
    expect(describeAskFailure(new ValidationError(), en).retryable).toBe(false);
    expect(describeAskFailure(new UnsupportedDataError(), en).retryable).toBe(false);
    expect(describeAskFailure(new NotFoundError(), en).retryable).toBe(false);
  });

  it("treats an untyped failure as unknown rather than inventing a cause", () => {
    const failure = describeAskFailure(new Error("socket hang up"), en);
    expect(failure.kind).toBe("unknown");
    expect(failure.title).toBe(en.askErrorUnknownTitle);
    // The raw message must not leak into the UI.
    expect(failure.message).not.toContain("socket hang up");
  });

  it("reads the kind even when `instanceof` cannot match", () => {
    // A duplicated client module (bundler or test double) would break instanceof.
    const duplicated = { name: "ApiError", kind: "network", message: "Network request failed" };
    expect(readApiErrorKind(duplicated)).toBe("network");
    expect(describeAskFailure(duplicated, en).kind).toBe("offline");

    expect(readApiErrorKind({ kind: "not-a-real-kind" })).toBeNull();
    expect(readApiErrorKind(null)).toBeNull();
    expect(readApiErrorKind("nope")).toBeNull();
  });

  it("has copy for every state in every language", () => {
    for (const t of [en, rw]) {
      const kinds = [
        new NetworkError(),
        new TimeoutError(),
        new ServerError(),
        new ValidationError(),
        new UnsupportedDataError(),
        new NotFoundError(),
        new Error("x"),
      ];
      for (const error of kinds) {
        const failure = describeAskFailure(error, t);
        expect(failure.title.length).toBeGreaterThan(0);
        expect(failure.message.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("askProgressStages", () => {
  it("describes six distinct product-level stages", () => {
    const stages = askProgressStages(en);
    expect(stages).toHaveLength(6);
    expect(new Set(stages).size).toBe(6);
  });

  it("never claims a computation finished", () => {
    for (const stage of askProgressStages(en)) {
      // In-progress framing: a gerund plus an ellipsis, never "Found...".
      expect(stage).toMatch(/^[A-Z][a-z]+ing /);
      expect(stage.endsWith("…")).toBe(true);
      expect(stage.toLowerCase()).not.toMatch(/\b(complete|completed|done|finished|found|ready)\b/);
    }
  });

  it("is translated for each language", () => {
    expect(askProgressStages(rw)).not.toEqual(askProgressStages(en));
    for (const stage of askProgressStages(rw)) expect(stage.length).toBeGreaterThan(0);
  });
});
