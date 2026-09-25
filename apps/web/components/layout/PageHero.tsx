export function PageHero({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <header className="page-hero relative isolate flex min-h-28 items-center overflow-hidden px-4 py-5 sm:px-6">
      <div className="relative z-10 max-w-[46rem]">
        <h1 className="text-2xl font-semibold text-forest-deep sm:text-[28px]">{title}</h1>
        <p className="mt-1 text-xs text-slate-700 sm:text-sm">{subtitle}</p>
      </div>
      <p className="relative z-10 ml-auto hidden shrink-0 text-right text-[11px] font-medium leading-relaxed text-white lg:block">
        Better Decisions<br />Greater Productivity<br />Stronger Food Systems
      </p>
    </header>
  );
}
