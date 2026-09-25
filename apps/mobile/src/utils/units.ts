/**
 * Quantity unit helpers.
 *
 * The canonical stored unit is **kilograms**. The UI may accept kilograms or
 * tonnes, so conversion happens exactly once - at the boundary - and is never
 * left implicit in a screen.
 */
import type { QuantityUnit } from "../types";

export const KG_PER_TONNE = 1000;

export const QUANTITY_UNITS: { code: QuantityUnit; label: string }[] = [
  { code: "kg", label: "Kilograms (kg)" },
  { code: "tonnes", label: "Tonnes (t)" },
];

/** Parse free text into a non-negative number, or null when it is not usable. */
export function parseQuantity(input: string): number | null {
  const cleaned = input.replace(/,/g, "").trim();
  if (!cleaned) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
}

/** Convert a user-entered amount to the canonical kilogram value. */
export function toKilograms(value: number, unit: QuantityUnit): number {
  return unit === "tonnes" ? value * KG_PER_TONNE : value;
}

/** Convert a canonical kilogram value for display in the chosen unit. */
export function fromKilograms(kg: number, unit: QuantityUnit): number {
  return unit === "tonnes" ? kg / KG_PER_TONNE : kg;
}

/** Human-readable quantity with the unit's natural precision. */
export function formatQuantity(kg: number | null | undefined, unit: QuantityUnit = "kg"): string {
  if (kg === null || kg === undefined || !Number.isFinite(kg)) return "—";
  const value = fromKilograms(kg, unit);
  const digits = unit === "tonnes" ? 2 : 0;
  return `${value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  })} ${unit === "tonnes" ? "t" : "kg"}`;
}

/** Largest attachment we accept locally. Must stay <= the server limit. */
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024; // 20 MB
export const MAX_ATTACHMENTS = 5;
