import type { ReactNode } from "react";

import { SourceDisclosure } from "@/components/ui/SourceDisclosure";
import { cn } from "@/lib/cn";

export function Card({
  children,
  className,
  as: Tag = "section",
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "div" | "article";
}) {
  return <Tag className={cn("card", className)}>{children}</Tag>;
}

export function CardHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3 px-4 pt-4", className)}>
      <div className="min-w-0">
        <h2 className="card-title">{title}</h2>
        {subtitle ? <p className="card-subtitle mt-0.5">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("px-4 pb-4 pt-3", className)}>{children}</div>;
}

/**
 * Source note under a figure or table.
 *
 * Delegates to `SourceDisclosure`, so the reader's "show sources by default"
 * preference is honoured in one place for every chart and table that uses it.
 */
export function SourceNote({ children }: { children: ReactNode }) {
  return <SourceDisclosure>{children}</SourceDisclosure>;
}
