"use client";

import { Check, Languages, Moon, RotateCcw, SlidersHorizontal } from "lucide-react";
import type { ReactNode } from "react";

import { usePreferences } from "@/components/providers/PreferencesProvider";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { PageHeading } from "@/components/ui/PageHeading";
import { useLanguage, type Lang } from "@/lib/i18n";
import { useCrops, useDistricts, usePeriods } from "@/services/hooks/useReference";

/* ------------------------------------------------------------------ */
/* Controls                                                            */
/* ------------------------------------------------------------------ */

function SettingRow({
  id,
  title,
  description,
  control,
}: {
  id: string;
  title: string;
  description?: ReactNode;
  control: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-forest/5 py-3 first:pt-0 last:border-b-0 last:pb-0">
      <div className="min-w-0">
        <label htmlFor={id} className="block text-sm font-medium text-forest-deep">
          {title}
        </label>
        {description ? (
          <p className="mt-0.5 max-w-xl text-xs leading-relaxed text-slate-500">{description}</p>
        ) : null}
      </div>
      <div className="shrink-0 pt-0.5">{control}</div>
    </div>
  );
}

/**
 * An accessible on/off control.
 *
 * A real `role="switch"` with `aria-checked` rather than a styled checkbox, so a
 * screen reader announces the state and not just the label.
 */
function Switch({
  id,
  checked,
  onChange,
  label,
}: {
  id: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/40 " +
        (checked ? "bg-primary" : "bg-forest/15")
      }
    >
      <span
        aria-hidden="true"
        className={
          "inline-block rounded-full bg-white shadow-sm transition-transform " +
          (checked ? "translate-x-6" : "translate-x-1")
        }
        style={{ height: "1.125rem", width: "1.125rem" }}
      />
    </button>
  );
}

function PreferenceSelect({
  id,
  value,
  onChange,
  options,
  ariaLabel,
}: {
  id: string;
  value: string;
  onChange: (next: string) => void;
  options: { value: string; label: string }[];
  ariaLabel: string;
}) {
  return (
    <select
      id={id}
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="input w-52"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

const LANGUAGE_OPTIONS: { value: Lang; label: string; note: string }[] = [
  { value: "en", label: "English", note: "Full interface coverage." },
  {
    value: "rw",
    label: "Kinyarwanda",
    note: "Navigation and interface chrome only — analytical labels stay in English until the translations are reviewed.",
  },
];

export function SettingsView() {
  const { preferences, setPreference, reset } = usePreferences();
  const { lang, setLang } = useLanguage();

  const { data: periodsData } = usePeriods();
  const { data: crops } = useCrops();
  const { data: districts } = useDistricts();

  const periods = periodsData?.periods ?? [];
  const periodOptions = [
    { value: "", label: "No default — each page decides" },
    ...periods.map((p) => ({ value: p.period_code, label: p.label })),
  ];
  const cropOptions = [
    { value: "", label: "No default crop" },
    ...(crops ?? []).map((c) => ({ value: c.crop_name, label: c.crop_name })),
  ];
  const provinceOptions = [
    { value: "", label: "No default province" },
    ...Array.from(new Set((districts ?? []).map((d) => d.province).filter(Boolean)))
      .sort()
      .map((p) => ({ value: String(p), label: String(p) })),
  ];
  // Cascade: only districts inside the chosen default province are offered.
  const districtOptions = [
    { value: "", label: "No default district" },
    ...(districts ?? [])
      .filter((d) => !preferences.defaultProvince || d.province === preferences.defaultProvince)
      .map((d) => ({ value: d.district, label: d.district }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  ];

  const languageNote = LANGUAGE_OPTIONS.find((o) => o.value === lang)?.note;

  return (
    <div className="space-y-5">
      <PageHeading
        title="Settings"
        subtitle="Preferences are stored in this browser only — no account is required, and nothing here changes the underlying data."
        action={
          <button type="button" className="btn" onClick={reset}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Reset to defaults
          </button>
        }
      />

      {/* Language */}
      <Card>
        <CardHeader
          title={
            <span className="inline-flex items-center gap-2">
              <Languages className="h-4 w-4 text-primary" aria-hidden="true" /> Language
            </span>
          }
          subtitle="Applies immediately across the navigation and interface chrome."
        />
        <CardBody>
          <SettingRow
            id="language-select"
            title="Interface language"
            description={languageNote}
            control={
              <PreferenceSelect
                id="language-select"
                ariaLabel="Interface language"
                value={lang}
                onChange={(v) => setLang(v as Lang)}
                options={LANGUAGE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              />
            }
          />
          <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
            Translation status: navigation and interface chrome are translated; analytical labels,
            indicator names and source titles remain in English by design — they are data labels,
            and a paraphrase could change their meaning.
          </p>
        </CardBody>
      </Card>

      {/* Default analytical context */}
      <Card>
        <CardHeader
          title={
            <span className="inline-flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-primary" aria-hidden="true" /> Default
              analytical context
            </span>
          }
          subtitle="Used when a page URL does not already carry a selection."
        />
        <CardBody>
          <SettingRow
            id="default-period"
            title="Period"
            description="An explicit link or filter always wins over this default, so a shared URL reproduces exactly what the sender saw."
            control={
              <PreferenceSelect
                id="default-period"
                ariaLabel="Default period"
                value={preferences.defaultPeriod ?? ""}
                onChange={(v) => setPreference("defaultPeriod", v || null)}
                options={periodOptions}
              />
            }
          />
          <SettingRow
            id="default-crop"
            title="Crop"
            control={
              <PreferenceSelect
                id="default-crop"
                ariaLabel="Default crop"
                value={preferences.defaultCrop ?? ""}
                onChange={(v) => setPreference("defaultCrop", v || null)}
                options={cropOptions}
              />
            }
          />
          <SettingRow
            id="default-province"
            title="Province"
            control={
              <PreferenceSelect
                id="default-province"
                ariaLabel="Default province"
                value={preferences.defaultProvince ?? ""}
                onChange={(v) => {
                  // Changing the province can invalidate the chosen district, so
                  // the district is cleared with it rather than left dangling.
                  setPreference("defaultProvince", v || null);
                  if (v && preferences.defaultDistrict) {
                    const stillValid = (districts ?? []).some(
                      (d) => d.district === preferences.defaultDistrict && d.province === v,
                    );
                    if (!stillValid) setPreference("defaultDistrict", null);
                  }
                }}
                options={provinceOptions}
              />
            }
          />
          <SettingRow
            id="default-district"
            title="District"
            control={
              <PreferenceSelect
                id="default-district"
                ariaLabel="Default district"
                value={preferences.defaultDistrict ?? ""}
                onChange={(v) => setPreference("defaultDistrict", v || null)}
                options={districtOptions}
              />
            }
          />
        </CardBody>
      </Card>

      {/* Appearance */}
      <Card>
        <CardHeader
          title={
            <span className="inline-flex items-center gap-2">
              <Moon className="h-4 w-4 text-primary" aria-hidden="true" /> Appearance
            </span>
          }
          subtitle="The colour scheme applies immediately and is remembered in this browser."
        />
        <CardBody>
          <SettingRow
            id="theme"
            title="Colour scheme"
            description="“System” follows your operating system and updates automatically when it changes."
            control={
              <PreferenceSelect
                id="theme"
                ariaLabel="Colour scheme"
                value={preferences.theme}
                onChange={(v) =>
                  setPreference(
                    "theme",
                    v === "dark" || v === "light" ? v : "system",
                  )
                }
                options={[
                  { value: "system", label: "System" },
                  { value: "light", label: "Light" },
                  { value: "dark", label: "Dark" },
                ]}
              />
            }
          />
        </CardBody>
      </Card>

      {/* Display */}
      <Card>
        <CardHeader
          title="Display"
          subtitle="Presentation only — these never change a computed value."
        />
        <CardBody>
          <SettingRow
            id="number-grouping"
            title="Thousands separators"
            description="“1,234” versus “1234” in tables and headline figures."
            control={
              <PreferenceSelect
                id="number-grouping"
                ariaLabel="Number formatting"
                value={preferences.numberGrouping}
                onChange={(v) =>
                  setPreference("numberGrouping", v === "plain" ? "plain" : "grouped")
                }
                options={[
                  { value: "grouped", label: "Grouped (1,234)" },
                  { value: "plain", label: "Plain (1234)" },
                ]}
              />
            }
          />
          <SettingRow
            id="compact-tables"
            title="Compact tables"
            description="Tighter rows, so more of a ranking fits on one screen."
            control={
              <Switch
                id="compact-tables"
                label="Compact tables"
                checked={preferences.compactTables}
                onChange={(v) => setPreference("compactTables", v)}
              />
            }
          />
          <SettingRow
            id="reduced-motion"
            title="Reduced motion"
            description="Disables interface transitions and chart entry animations. Your operating system's reduced-motion setting is also honoured automatically."
            control={
              <Switch
                id="reduced-motion"
                label="Reduced motion"
                checked={preferences.reducedMotion}
                onChange={(v) => setPreference("reducedMotion", v)}
              />
            }
          />
          <SettingRow
            id="map-labels"
            title="District names on maps"
            description="Shows district labels on the choropleth by default. The map's own toggle still overrides this for a single view."
            control={
              <Switch
                id="map-labels"
                label="District names on maps"
                checked={preferences.mapLabels}
                onChange={(v) => setPreference("mapLabels", v)}
              />
            }
          />
        </CardBody>
      </Card>

      {/* Data disclosure */}
      <Card>
        <CardHeader
          title="Data and sources"
          subtitle="How much provenance is shown next to each figure."
        />
        <CardBody>
          <SettingRow
            id="show-sources"
            title="Show sources by default"
            description="Expands the source, method, benchmark and limitations under each figure. Turning this off collapses them to a single control — the provenance is never hidden entirely."
            control={
              <Switch
                id="show-sources"
                label="Show sources by default"
                checked={preferences.showSources}
                onChange={(v) => setPreference("showSources", v)}
              />
            }
          />
          <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-slate-500">
            <Check className="mt-0.5 h-3 w-3 shrink-0 text-primary" aria-hidden="true" />
            Availability, coverage and provenance are always reachable from the Data &amp; Models
            workspace, regardless of this setting.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
