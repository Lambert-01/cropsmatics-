/**
 * Onboarding routing rules.
 *
 * Extracted from the root layout so the launch decision is a pure function that
 * can be tested without mounting the router. Two facts drive it:
 *
 * - A session must not be shown the app before the persisted flag has loaded,
 *   or a returning user sees a flash of onboarding.
 * - A session that has finished onboarding (Continue *or* Skip) must not be
 *   bounced back into it. Skip previously navigated home without recording
 *   completion, so the guard immediately redirected the user back to
 *   onboarding — a loop with no way out.
 */

export interface OnboardingState {
  /** The persisted store has finished loading. */
  hydrated: boolean;
  /** The user has completed or skipped onboarding. */
  onboardingComplete: boolean;
}

/**
 * The route to force, or ``null`` to leave navigation alone.
 *
 * Returns `/onboarding` only once hydration is done and the flag is clear and
 * the user is not already inside onboarding. Anything else is a no-op, which is
 * what stops the redirect from firing on every render.
 */
export function resolveOnboardingRoute(
  state: OnboardingState,
  segments: readonly string[],
): string | null {
  if (!state.hydrated) return null;
  const inOnboarding = segments[0] === "onboarding";
  if (!state.onboardingComplete && !inOnboarding) return "/onboarding";
  return null;
}

/**
 * Whether a launch should begin in onboarding.
 *
 * Used to model the Skip/Continue outcome: whichever control the user takes must
 * set `onboardingComplete = true`, so the next launch starts in the app.
 */
export function shouldStartInOnboarding(state: OnboardingState): boolean {
  return state.hydrated && !state.onboardingComplete;
}
