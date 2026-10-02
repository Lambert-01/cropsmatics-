"use client";

import { ArrowDown, ArrowUp, ChevronDown, Minus } from "lucide-react";
import { useState } from "react";

import { Card, CardHeader, SourceNote } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/States";
import { cn } from "@/lib/cn";
import { fmtNumber } from "@/lib/format";
import type { RankMovement, RankMovementRow } from "@/types";

const PREVIEW_ROWS = 10;

/**
 * How a movement is described. Deliberately never says a district "improved" or
 * "deteriorated": relative position moves for several reasons, including a peer
 * falling or the district group changing. The label states the movement itself.
 */
const DIRECTION_STYLE: Record<
  string,
  { label: string; className: string; Icon: typeof ArrowUp }
> = {
  up: { label: "moved up", className: "bg-success/10 text-success", Icon: ArrowUp },
  down: { label: "moved down", className: "bg-danger/10 text-danger", Icon: ArrowDown },
  unchanged: { label: "held position", className: "bg-slate-100 text-slate-500", Icon: Minus },
};

function GroupTag({ text, tone }: { text: string; tone: "neutral" | "warn" }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[10px] font-medium",
        tone === "warn" ? "bg-amber/10 text-amber" : "bg-forest/[0.06] text-slate-500",
      )}
    >
      {text}
    </span>
  );
}

function MovementRow({
  row,
  leftGroup,
  enteredGroup,
}: {
  row: RankMovementRow;
  leftGroup: Set<string>;
  enteredGroup: Set<string>;
}) {
  const left = leftGroup.has(row.district);
  const entered = enteredGroup.has(row.district);
  const style = DIRECTION_STYLE[row.direction];
  const comparable = !left && !entered;

  return (
    <li className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-forest/5 py-1.5 last:border-0">
      {/* BEFORE */}
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="w-6 shrink-0 text-right text-[11px] tabular-nums text-slate-400">
          {row.rank_before ?? "–"}
        </span>
        <span className="truncate text-xs font-medium text-slate-700">{row.district}</span>
      </div>

      {/* CONNECTOR + MOVEMENT */}
      <div className="flex w-16 shrink-0 flex-col items-center">
        {comparable && style ? (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
              style.className,
            )}
            title={style.label}
          >
            <style.Icon className="h-2.5 w-2.5" aria-hidden="true" />
            {row.movement === 0 ? "0" : `${(row.movement ?? 0) > 0 ? "+" : ""}${row.movement ?? 0}`}
          </span>
        ) : (
          <span className="text-[10px] text-slate-300">·</span>
        )}
      </div>

      {/* AFTER */}
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="w-6 shrink-0 text-right text-[11px] tabular-nums text-slate-400">
          {row.rank_after ?? "–"}
        </span>
        <span className="truncate text-xs font-medium text-slate-700">{row.district}</span>
        {left ? <GroupTag text="left group" tone="warn" /> : null}
        {entered ? <GroupTag text="entered group" tone="neutral" /> : null}
      </div>
    </li>
  );
}

/**
 * District ranking movement (before -> after).
 *
 * The gap a district closed or opened is shown alongside its movement so the
 * number is never the only evidence — and a district that only changed because
 * the *district group* changed is tagged as such rather than reading as a
 * performance fall.
 */
export function RankingMovement({
  movement,
  baselineLabel,
  scenarioLabel,
}: {
  movement: RankMovement;
  baselineLabel: string;
  scenarioLabel: string;
}) {
  const [expanded, setExpanded] = useState(false);

  const rows = movement?.districts ?? [];
  const leftGroup = new Set(movement?.left_group ?? []);
  const enteredGroup = new Set(movement?.entered_group ?? []);
  const shown = expanded ? rows : rows.slice(0, PREVIEW_ROWS);

  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader
          title="District ranking movement"
          subtitle="Position before and after the scenario"
        />
        <div className="p-4">
          <EmptyState
            title="No district can be compared between these two sides."
            hint="Both sides need published observations for the crop before a movement can be measured. This is not a result of zero — it means the comparison is unavailable."
          />
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="District ranking movement"
        subtitle={`${movement.n_moved} of ${movement.n_compared} compared districts changed position`}
      />

      <div className="grid grid-cols-[1fr_auto_1fr] gap-2 px-4 pt-3 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        <span>Before · {baselineLabel}</span>
        <span className="w-16 text-center">Δ</span>
        <span>After · {scenarioLabel}</span>
      </div>

      <ul className="px-4 pb-1 pt-1">
        {shown.map((row) => (
          <MovementRow
            key={row.district}
            row={row}
            leftGroup={leftGroup}
            enteredGroup={enteredGroup}
          />
        ))}
      </ul>

      {rows.length > PREVIEW_ROWS ? (
        <div className="px-4 pb-2">
          <button
            type="button"
            className="text-[11px] font-medium text-primary hover:underline"
            onClick={() => setExpanded((value) => !value)}
          >
            <ChevronDown
              className={cn("mr-1 inline h-3 w-3 transition", expanded && "rotate-180")}
              aria-hidden="true"
            />
            {expanded ? "Show fewer districts" : `Show all ${rows.length} districts`}
          </button>
        </div>
      ) : null}

      {movement.entered_priority.length || movement.left_priority.length ? (
        <div className="mx-4 mb-3 space-y-1 rounded-lg border border-forest/10 bg-forest/[0.02] p-2.5 text-[11px] text-slate-600">
          {movement.entered_priority.length ? (
            <p>
              <span className="font-semibold text-amber">Entered the high-priority band: </span>
              {movement.entered_priority.join(", ")}
            </p>
          ) : null}
          {movement.left_priority.length ? (
            <p>
              <span className="font-semibold text-success">Left the high-priority band: </span>
              {movement.left_priority.join(", ")}
            </p>
          ) : null}
        </div>
      ) : null}

      {leftGroup.size || enteredGroup.size ? (
        <div className="mx-4 mb-3 rounded-lg border border-amber/25 bg-amber/[0.06] p-2.5 text-[11px] text-slate-600">
          The district group itself changed, so these are <strong>not</strong> performance movements:
          {leftGroup.size ? <> {leftGroup.size} district(s) left the group</> : null}
          {leftGroup.size && enteredGroup.size ? " and" : null}
          {enteredGroup.size ? <> {enteredGroup.size} entered it</> : null}.
        </div>
      ) : null}

      <SourceNote>
        Movement is <code>rank before − rank after</code>, so a positive value means the district
        moved <strong>up</strong> inside the selected group. Ranks are computed separately within
        each side, so a district can also move because a peer moved. {fmtNumber(rows.length, 0)}{" "}
        districts assessed.
      </SourceNote>
    </Card>
  );
}
