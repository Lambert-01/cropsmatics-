import Link from "next/link";

const CAPABILITIES = [
  ["Productivity Intelligence", "Locate crop × district productivity gaps.", "/productivity"],
  ["Associated Factors", "Explain which observed practices track with yield.", "/productivity"],
  ["Intervention Prioritisation", "Rank areas for investigation with transparent weights.", "/interventions"],
  ["Post-Harvest & Storage", "Estimate risk and match produce to facilities.", "/storage"],
];

export default function HomePage() {
  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-3xl font-bold text-brand-forest">Cropmatics Rwanda</h1>
        <p className="mt-2 max-w-2xl text-slate-600">
          Crop Intelligence from Data to Action. Cropmatics Rwanda is an agricultural
          informatics and decision-intelligence platform built on official NISR statistics,
          geospatial information and clearly-labelled operational data.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        {CAPABILITIES.map(([title, desc, href]) => (
          <Link
            key={title}
            href={href}
            className="rounded-lg border border-slate-200 bg-white p-4 transition hover:border-brand-green"
          >
            <h2 className="font-semibold text-brand-forest">{title}</h2>
            <p className="mt-1 text-sm text-slate-600">{desc}</p>
          </Link>
        ))}
      </section>

      <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <strong>Scientific caution.</strong> Results describe associations between observed
        factors and yield, and priorities for investigation. They are not proof that changing a
        single factor will cause a specific yield change.
      </section>
    </div>
  );
}
