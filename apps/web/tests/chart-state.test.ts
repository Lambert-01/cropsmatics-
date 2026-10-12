import { describe, expect, it } from "vitest";

import { chartDisplayState, isUpdating } from "@/lib/chartState";

/**
 * The owner-reported bug: after changing a filter a chart rendered with
 * historical data and then disappeared. The component rule that allowed it was
 * `if (isLoading) return <Skeleton/>`, which treats any in-flight request as
 * "nothing to read". These are the cases that rule has to get right.
 */
describe("chartDisplayState", () => {
  it("shows the chart when a response is loaded and valid", () => {
    expect(chartDisplayState({ hasData: true, isLoading: false })).toBe("ready");
  });

  it("keeps a loaded chart while a background refetch is in flight", () => {
    // The regression: a refetch for the scope already on screen must not blank
    // the panel. `isLoading` is true for the first load *and* for a refetch that
    // has no data yet, so `hasData` has to win.
    expect(chartDisplayState({ hasData: true, isLoading: true })).toBe("ready");
  });

  it("keeps a loaded chart when a later request fails", () => {
    expect(chartDisplayState({ hasData: true, isLoading: false, hasError: true })).toBe("ready");
  });

  it("shows the skeleton only when nothing has loaded yet", () => {
    expect(chartDisplayState({ hasData: false, isLoading: true })).toBe("loading");
  });

  it("reports a failure only when there is no valid data to fall back on", () => {
    expect(chartDisplayState({ hasData: false, isLoading: false, hasError: true })).toBe("error");
    expect(chartDisplayState({ hasData: false, hasError: true, isLoading: true })).toBe("error");
  });

  it("reports an empty result as empty, never as loading or an error", () => {
    // An API that answered with no rows is a precise state: the selection has no
    // published data. Showing a spinner forever, or an error, would be wrong.
    expect(chartDisplayState({ hasData: false, isLoading: false })).toBe("empty");
  });
});

describe("isUpdating", () => {
  it("marks a substate update only when data is already on screen", () => {
    expect(isUpdating({ hasData: true, isFetching: true })).toBe(true);
    expect(isUpdating({ hasData: true, isFetching: false })).toBe(false);
  });

  it("is not 'updating' during a first load", () => {
    // The first load is `loading` - there is no previous answer to qualify.
    expect(isUpdating({ hasData: false, isFetching: true })).toBe(false);
  });
});
