import { describe, expect, it } from "vitest";

import { headlinePriorities, investigationAreas } from "@/lib/priority";
import type { PriorityRow } from "@/types";

function row(over: Partial<PriorityRow> & { id: string; district: string }): PriorityRow {
  return {
    crop: "Maize",
    score: 0.5,
    band: "high",
    gap: 10,
    vulnerability: 0.2,
    affected_scale: 0.3,
    readiness: 0.4,
    cost_constraint: 0.1,
    ...over,
  };
}

/** Deliberately *not* in score order, to prove the helper does not re-sort. */
const ROWS: PriorityRow[] = [
  row({ id: "a", district: "Rulindo", score: 0.91, crop: "Maize" }),
  row({ id: "b", district: "Nyagatare", score: 0.88, crop: "Beans" }),
  row({ id: "c", district: "Rulindo", score: 0.7, crop: "Beans" }),
  row({ id: "d", district: "Huye", score: 0.62, crop: "Rice" }),
  row({ id: "e", district: "Musanze", score: 0.4, crop: "Potato" }),
  row({ id: "f", district: "Kirehe", score: 0.31, crop: "Maize" }),
];

describe("headlinePriorities", () => {
  it("takes a prefix of the engine's order and never re-sorts", () => {
    const headline = headlinePriorities(ROWS, 3);
    expect(headline.map((r) => r.id)).toEqual(["a", "b", "c"]);
    // The first row is the engine's first row, even though it is also the highest
    // here - the point is that the helper cannot disagree with the table.
    expect(headline[0].id).toBe(ROWS[0].id);
  });

  it("does not promote a higher score that the engine ranked lower", () => {
    const engineOrder: PriorityRow[] = [
      row({ id: "first", district: "A", score: 0.2 }),
      row({ id: "second", district: "B", score: 0.95 }),
    ];
    expect(headlinePriorities(engineOrder, 2).map((r) => r.id)).toEqual(["first", "second"]);
  });

  it("handles a limit larger than the data and a non-positive limit", () => {
    expect(headlinePriorities(ROWS, 100)).toHaveLength(ROWS.length);
    expect(headlinePriorities(ROWS, 0)).toEqual([]);
    expect(headlinePriorities(ROWS, -1)).toEqual([]);
    expect(headlinePriorities([], 5)).toEqual([]);
  });
});

describe("investigationAreas", () => {
  it("returns one candidate per district, under its best-ranked one", () => {
    const areas = investigationAreas(ROWS, 10);
    expect(areas.map((r) => r.district)).toEqual([
      "Rulindo",
      "Nyagatare",
      "Huye",
      "Musanze",
      "Kirehe",
    ]);
    // Rulindo appears once, and it is its first-ranked candidate.
    const rulindo = areas.filter((r) => r.district === "Rulindo");
    expect(rulindo).toHaveLength(1);
    expect(rulindo[0].id).toBe("a");
  });

  it("honours the limit", () => {
    expect(investigationAreas(ROWS, 2).map((r) => r.district)).toEqual(["Rulindo", "Nyagatare"]);
    expect(investigationAreas(ROWS, 0)).toEqual([]);
  });

  it("returns nothing for an empty selection rather than throwing", () => {
    expect(investigationAreas([], 6)).toEqual([]);
  });
});
