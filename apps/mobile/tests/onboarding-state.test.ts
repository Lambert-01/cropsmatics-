import { describe, expect, it } from "vitest";

import {
  resolveOnboardingRoute,
  shouldStartInOnboarding,
  type OnboardingState,
} from "../src/utils/onboarding";

const state = (overrides: Partial<OnboardingState> = {}): OnboardingState => ({
  hydrated: false,
  onboardingComplete: false,
  ...overrides,
});

describe("resolveOnboardingRoute", () => {
  it("waits for hydration before deciding anything", () => {
    expect(resolveOnboardingRoute(state(), [])).toBeNull();
  });

  it("sends a fresh session into onboarding once hydrated", () => {
    expect(resolveOnboardingRoute(state({ hydrated: true }), [])).toBe("/onboarding");
  });

  it("does not redirect a session that is already inside onboarding", () => {
    expect(resolveOnboardingRoute(state({ hydrated: true }), ["onboarding"])).toBeNull();
  });

  it("lets a completed session through to the app", () => {
    expect(
      resolveOnboardingRoute(state({ hydrated: true, onboardingComplete: true }), []),
    ).toBeNull();
  });

  it("keeps a completed session out of onboarding even if it deep-links there", () => {
    // Returning to /onboarding after completion is allowed to render, but the
    // guard must not force a *new* redirect loop.
    expect(
      resolveOnboardingRoute(state({ hydrated: true, onboardingComplete: true }), ["onboarding"]),
    ).toBeNull();
  });
});

describe("shouldStartInOnboarding", () => {
  it("is true only once hydrated and not yet complete", () => {
    expect(shouldStartInOnboarding(state())).toBe(false);
    expect(shouldStartInOnboarding(state({ hydrated: true }))).toBe(true);
    expect(shouldStartInOnboarding(state({ hydrated: true, onboardingComplete: true }))).toBe(false);
  });

  it("models the Skip outcome: once marked complete, the next launch starts in the app", () => {
    // Skip must set onboardingComplete = true; this is the state that results.
    const afterSkip: OnboardingState = { hydrated: true, onboardingComplete: true };
    expect(resolveOnboardingRoute(afterSkip, [])).toBeNull();
    expect(shouldStartInOnboarding(afterSkip)).toBe(false);
  });
});
