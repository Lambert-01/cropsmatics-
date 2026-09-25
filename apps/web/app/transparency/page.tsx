export default function TransparencyPage() {
  return (
    <div className="prose prose-slate max-w-3xl">
      <h1 className="text-2xl font-bold text-brand-forest">Data &amp; Model Transparency</h1>

      <h2 className="mt-6 text-lg font-semibold">Data policy</h2>
      <ul className="list-disc pl-6 text-slate-700">
        <li>Official NISR/MINAGRI statistics are kept separate from voluntary app data.</li>
        <li>App data is explicitly not national statistics.</li>
        <li>Synthetic fixtures are labelled and isolated under <code>data/dev_fixtures/</code>.</li>
        <li>Missing values are null; capacity is never invented.</li>
      </ul>

      <h2 className="mt-6 text-lg font-semibold">Model policy</h2>
      <ul className="list-disc pl-6 text-slate-700">
        <li>Results describe <strong>associations</strong>, not proven causal effects.</li>
        <li>Benchmark strategies are configurable and shown with every result.</li>
        <li>Priority weights are visible and adjustable.</li>
        <li>Every result exposes source, period, method and limitations.</li>
      </ul>

      <h2 className="mt-6 text-lg font-semibold">Sources</h2>
      <p className="text-slate-700">
        See the repository&apos;s <code>data/source_registry</code> and{" "}
        <code>docs/DATA_PROVENANCE.md</code> for source pages, access terms and raw files.
      </p>
    </div>
  );
}
