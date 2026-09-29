import { describe, expect, it } from "vitest";

import { buildSuggestions, cropHref, datasetHref, districtHref } from "@/lib/search";

const crops = [{ name: "Maize" }, { name: "Rice" }, { name: "Banana" }];
const districts = [{ name: "Nyagatare" }, { name: "Gasabo" }];
const datasets = [
  { key: "irrigation_water", label: "Irrigation & Water" },
  { key: "crop_productivity", label: "Crop Productivity (2024A-2026B)" },
];

describe("buildSuggestions", () => {
  it("stays quiet until the query is meaningful", () => {
    expect(buildSuggestions({ query: "", crops, districts, datasets })).toEqual([]);
    expect(buildSuggestions({ query: "m", crops, districts, datasets })).toEqual([]);
  });

  it("opens a crop in the productivity view for that crop", () => {
    const [first] = buildSuggestions({ query: "maize", crops, districts, datasets });
    expect(first.kind).toBe("crop");
    expect(first.href).toBe("/productivity?crop=Maize");
  });

  it("opens a district on the map", () => {
    const [first] = buildSuggestions({ query: "nyaga", crops, districts, datasets });
    expect(first.kind).toBe("district");
    expect(first.href).toBe("/maps?district=Nyagatare");
  });

  it("opens a dataset in the Data Explorer", () => {
    const [first] = buildSuggestions({ query: "irrigation", crops, districts, datasets });
    expect(first.kind).toBe("dataset");
    expect(first.href).toBe("/data-explorer?dataset=irrigation_water");
  });

  it("matches dataset keys as well as labels", () => {
    const found = buildSuggestions({ query: "crop_productivity", crops, districts, datasets });
    expect(found.map((s) => s.value)).toContain("crop_productivity");
  });

  it("is case-insensitive", () => {
    expect(buildSuggestions({ query: "BANANA", crops })[0].value).toBe("Banana");
  });

  it("ranks crops above districts above datasets", () => {
    const kinds = buildSuggestions({
      query: "ab",
      crops: [{ name: "ab-crop" }],
      districts: [{ name: "ab-district" }],
      datasets: [{ key: "ab", label: "ab-dataset" }],
    }).map((s) => s.kind);
    expect(kinds).toEqual(["crop", "district", "dataset"]);
  });

  it("respects the result limit", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ name: `Crop ${i}` }));
    expect(buildSuggestions({ query: "crop", crops: many, limit: 3 })).toHaveLength(3);
  });

  it("encodes names that are not URL-safe", () => {
    const [first] = buildSuggestions({ query: "nyaru", districts: [{ name: "Nyarugenge City" }] });
    expect(first.href).toBe("/maps?district=Nyarugenge%20City");
  });
});

describe("destination helpers", () => {
  it("build the documented routes", () => {
    expect(cropHref("Maize")).toBe("/productivity?crop=Maize");
    expect(districtHref("Gasabo")).toBe("/maps?district=Gasabo");
    expect(datasetHref("erosion_control")).toBe("/data-explorer?dataset=erosion_control");
  });
});
