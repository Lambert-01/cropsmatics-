/**
 * What a chart panel should be showing, decided in one place.
 *
 * The owner-reported bug was "a chart becomes visible with historical data and
 * then disappears". The cause was query-key churn, but the component-level rule
 * that let it happen was also wrong: `if (isLoading) return <Skeleton/>` treats
 * *any* in-flight request as "there is nothing to read", so a panel that already
 * holds a valid response is torn down and replaced by a placeholder.
 *
 * Four states, kept separate because conflating them is what produced the
 * symptom:
 *
 * * **ready**   - there is a response for the scope currently on screen
 * * **loading** - nothing has arrived yet for this scope
 * * **empty**   - the API answered and the answer carries no rows
 * * **error**   - the request failed and there is nothing valid to show
 *
 * ``hasData`` always wins. Data that is valid for the selection on screen must
 * not be replaced because a *later* request failed or is still running: the
 * reader is looking at real published statistics, and blanking them is a worse
 * lie than showing them while a newer answer loads.
 */
export type ChartDisplayState = "ready" | "loading" | "empty" | "error";

export function chartDisplayState({
  hasData,
  isLoading,
  hasError,
}: {
  hasData: boolean;
  isLoading?: boolean;
  hasError?: boolean;
}): ChartDisplayState {
  if (hasData) return "ready";
  if (hasError) return "error";
  if (isLoading) return "loading";
  return "empty";
}

/**
 * Whether to show the "updating" affordance.
 *
 * Only meaningful once the panel is `ready`: a first load is `loading`, not
 * "updating", and a panel with no data has nothing to keep on screen.
 */
export function isUpdating({
  hasData,
  isFetching,
}: {
  hasData: boolean;
  isFetching?: boolean;
}): boolean {
  return Boolean(hasData && isFetching);
}
