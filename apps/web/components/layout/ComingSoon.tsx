import { Construction } from "lucide-react";
import Link from "next/link";

export function ComingSoon({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="card p-8 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
          <Construction className="h-6 w-6" aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-xl font-semibold text-forest-deep">{title}</h1>
        <p className="mt-2 text-sm text-slate-600">{description}</p>
        <p className="mt-1 text-xs text-slate-500">Coming in the next module.</p>
        <div className="mt-5 flex justify-center gap-2">
          <Link href="/dashboard" className="btn btn-primary">
            Back to overview
          </Link>
          <Link href="/transparency" className="btn">
            See what is implemented
          </Link>
        </div>
      </div>
    </div>
  );
}
