"use client";

import { AlertTriangle, DatabaseZap, ShieldCheck } from "lucide-react";

import { Card, CardHeader, SourceNote } from "@/components/ui/Card";
import type { MarketStatus } from "@/types";

function Fact({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-forest/10 bg-white/60 px-3 py-2">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold tabular-nums text-forest-deep">{value}</dd>
      {hint ? <p className="mt-0.5 text-[10px] text-slate-400">{hint}</p> : null}
    </div>
  );
}

/**
 * Market data status.
 *
 * This is the honest answer to "where are the prices?": the schema is designed
 * and registered, no attributable price feed has been ingested, and therefore no
 * price is shown. Nothing here is a placeholder price, and the page says which
 * step is missing rather than implying the data are merely loading.
 */
export function MarketStatusPanel({ status }: { status: MarketStatus }) {
  const coverage = status.date_coverage;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="Market data status"
          subtitle="What is registered, what is loaded, and what is missing"
          action={
            <span className="rounded-full bg-amber/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber">
              No verified prices loaded
            </span>
          }
        />

        <div className="flex items-start gap-2 px-4 pt-3 text-xs text-slate-600">
          <DatabaseZap className="mt-0.5 h-4 w-4 shrink-0 text-amber" aria-hidden="true" />
          <span>{status.reason}</span>
        </div>

        <dl className="grid gap-2 px-4 pt-3 sm:grid-cols-2 lg:grid-cols-4">
          <Fact label="Observations loaded" value={String(status.observations)} hint="verified rows" />
          <Fact
            label="Rows in file"
            value={String(status.rows_in_file)}
            hint={status.synthetic_rows ? `${status.synthetic_rows} synthetic, excluded` : "none synthetic"}
          />
          <Fact
            label="Date coverage"
            value={coverage ? `${coverage.start} → ${coverage.end}` : "—"}
            hint={coverage ? undefined : "no dated observation"}
          />
          <Fact label="Registered sources" value={String(status.registered_sources.length)} />
          <Fact label="Commodities" value={String(status.commodity_count)} />
          <Fact label="Reporting markets" value={String(status.market_count)} />
          <Fact label="Districts" value={String(status.district_count)} />
          <Fact label="Provinces" value={String(status.province_count)} />
        </dl>

        <div className="px-4 pt-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Price types the schema keeps separate
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {status.price_types_supported.map((type) => {
              const present = status.price_types_present.includes(type);
              return (
                <span
                  key={type}
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                    present
                      ? "border-success/30 bg-success/10 text-success"
                      : "border-forest/15 bg-white text-slate-400"
                  }`}
                >
                  {type}
                  {present ? "" : " · none loaded"}
                </span>
              );
            })}
          </div>
        </div>

        <SourceNote>
          Farmgate, producer, wholesale, retail, assembly and unspecified prices are different
          measurements. Cropmatics never averages them into a single &ldquo;market price&rdquo;, so a
          price is only ever shown for the type it was reported as.
        </SourceNote>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="What is already in place"
            subtitle="The domain is built; only the feed is missing"
          />
          <ul className="ml-8 list-disc space-y-1.5 px-4 pb-3 pt-2 text-xs text-slate-600">
            <li>
              A registered observation schema
              {status.table_present && status.schema_columns.length
                ? ` (${status.schema_columns.length} columns)`
                : ""}{" "}
              that records commodity, market, district, price type, currency, unit and source.
            </li>
            <li>
              Every published price keeps its original value, currency and unit alongside the
              normalized RWF/kg value, so a conversion can always be audited.
            </li>
            <li>
              Rows flagged synthetic are excluded from every figure, so a fixture can never be
              presented as an observation.
            </li>
            {status.manifest?.file ? (
              <li>
                A dataset manifest entry with a content hash, so the loaded table is verifiable:{" "}
                <code className="text-[10px]">{status.manifest.file}</code>
              </li>
            ) : null}
          </ul>
        </Card>

        <Card>
          <CardHeader title="What is missing" subtitle="Why this page shows a status instead of prices" />
          <div className="space-y-2 px-4 pb-3 pt-3 text-xs text-slate-600">
            <p className="flex items-start gap-2 rounded-lg border border-amber/25 bg-amber/[0.06] p-2.5">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber" aria-hidden="true" />
              <span>
                No licensed, attributable market price source is registered for Rwanda in this
                package, so there is nothing that could be published without inventing it.
              </span>
            </p>
            {status.notes.map((note) => (
              <p key={note} className="text-[11px] text-slate-500">
                {note}
              </p>
            ))}
          </div>
          <SourceNote>
            <span className="inline-flex items-start gap-1.5">
              <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0 text-primary" aria-hidden="true" />
              <span>
                This is a deliberate product decision: a plausible-looking sample price would be
                indistinguishable from a real one once it reached a decision-maker.
              </span>
            </span>
          </SourceNote>
        </Card>
      </div>
    </div>
  );
}
