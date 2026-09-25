import { describe, expect, it } from "vitest";

import { navItemClasses } from "@/components/layout/AppSidebar";
import { BADGE_KINDS, type DataBadgeKind } from "@/components/ui/DataBadge";
import {
  COVERAGE_MODES,
  coverageBadge,
  coverageMode,
  coverageNotice,
  needsNationalContextNotice,
} from "@/lib/coverage";

describe("coverage mode", () => {
  it("classifies district, national and crop-level coverage", () => {
    expect(coverageMode("district")).toBe("district");
    expect(coverageMode("national")).toBe("national");
    expect(coverageMode("national_crop")).toBe("national_crop");
  });

  it("is case-insensitive and defaults to unknown", () => {
    expect(coverageMode("DISTRICT")).toBe("district");
    expect(coverageMode(" National ")).toBe("national");
    expect(coverageMode(null)).toBe("unknown");
    expect(coverageMode("something-new")).toBe("unknown");
  });

  it("only asks for district estimates when district data actually exist", () => {
    expect(needsNationalContextNotice("district")).toBe(false);
    for (const mode of COVERAGE_MODES.filter((m) => m !== "district")) {
      expect(needsNationalContextNotice(mode)).toBe(true);
    }
  });

  it("never claims a district estimate and names the period", () => {
    expect(coverageNotice("district", "2025B")).toBeNull();

    const national = coverageNotice("national", "2025 Season A");
    expect(national).toContain("2025 Season A");
    expect(national).toContain("national statistics only");
    expect(national).toContain("no district estimates are fabricated");

    // An unknown level must not be presented as if it were district data.
    expect(coverageNotice("unknown", "2026 Season A")).toContain("national statistics only");
    expect(coverageNotice("national_crop")).toContain("this period");
  });

  it("labels each coverage mode distinctly", () => {
    const labels = COVERAGE_MODES.map(coverageBadge);
    expect(new Set(labels).size).toBe(COVERAGE_MODES.length);
    expect(coverageBadge("district")).toBe("DISTRICT DATA");
    expect(coverageBadge("national")).toBe("NATIONAL ONLY");
  });
});

describe("provenance badges", () => {
  it("covers every provenance layer the UI must distinguish", () => {
    for (const kind of [
      "official_national",
      "verified_program",
      "scenario_input",
      "not_verified",
      "facility_unavailable",
    ] as DataBadgeKind[]) {
      expect(BADGE_KINDS[kind]).toBeDefined();
      expect(BADGE_KINDS[kind].label.length).toBeGreaterThan(0);
      expect(BADGE_KINDS[kind].title.length).toBeGreaterThan(0);
      expect(BADGE_KINDS[kind].className.length).toBeGreaterThan(0);
    }
  });

  it("labels national statistics as national, not as facility capacity", () => {
    expect(BADGE_KINDS.official_national.label).toContain("NATIONAL");
    expect(BADGE_KINDS.official_national.title.toLowerCase()).toContain("not district");
  });

  it("states plainly when facility-level data do not exist", () => {
    expect(BADGE_KINDS.facility_unavailable.label).toContain("NOT AVAILABLE");
  });

  it("distinguishes scenario input from verified data", () => {
    expect(BADGE_KINDS.scenario_input.label).toContain("SCENARIO");
    expect(BADGE_KINDS.scenario_input.title.toLowerCase()).toContain("not official");
  });
});

describe("sidebar active contrast", () => {
  it("uses a distinct surface for the active item", () => {
    const active = navItemClasses(true);
    const inactive = navItemClasses(false);
    expect(active.link).toContain("bg-primary");
    expect(active.link).not.toBe(inactive.link);
  });

  it("keeps the active text white so it reads on the teal surface", () => {
    expect(navItemClasses(true).link).toContain("text-white");
  });

  it("keeps the active icon white, never primary green on primary green", () => {
    const icon = navItemClasses(true).icon;
    expect(icon).toContain("text-white");
    // Regression guard: the active icon used to be `text-primary`, which was the
    // same colour family as the active background.
    expect(icon).not.toContain("text-primary");
  });

  it("keeps inactive items subdued but hover-visible", () => {
    const inactive = navItemClasses(false);
    expect(inactive.link).toContain("text-white/70");
    expect(inactive.icon).toContain("text-white/50");
  });
});
