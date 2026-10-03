"use client";

import { ArrowRight, Sprout } from "lucide-react";
import Link from "next/link";

import { resolveCrop } from "@/features/crops/catalog";
import { useCrops } from "@/services/hooks/useReference";

/**
 * Entry point into the Crop Intelligence workspace.
 *
 * When a crop is active in the shared filters it offers a direct jump to that
 * crop's page; otherwise it offers the catalogue. It resolves the crop's code
 * from the catalogue so the link can never point at a slug the catalogue does
 * not publish — an unresolved crop simply falls back to the catalogue link.
 */
export function CropEntryPoint({ crop }: { crop?: string }) {
  const { data: crops } = useCrops();
  const match = crop ? resolveCrop(crops, crop) : undefined;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {match ? (
        <Link
          href={`/crops/${encodeURIComponent(match.crop_code)}`}
          className="btn btn-primary text-xs"
        >
          <Sprout className="h-3.5 w-3.5" aria-hidden="true" />
          Open {match.crop_name} Intelligence
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      ) : null}
      <Link href="/crops" className="btn text-xs">
        <Sprout className="h-3.5 w-3.5" aria-hidden="true" />
        {match ? "All crops" : "Browse crops"}
      </Link>
    </div>
  );
}
