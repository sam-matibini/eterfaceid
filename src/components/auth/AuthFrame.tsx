import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

export function AuthFrame({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--paper)]">
      <div className="border-b border-[var(--rule)] bg-background">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <Link to="/" className="font-display text-lg font-bold tracking-tight">
            <span className="text-[var(--ink)]">eterface</span>
            <span className="text-[var(--signal)]">ID</span>
          </Link>
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
            Back to site
          </Link>
        </div>
      </div>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-16">
        <h1 className="font-display text-3xl font-bold tracking-tight">{title}</h1>
        {subtitle ? <p className="mt-3 text-sm text-muted-foreground">{subtitle}</p> : null}
        <div className="mt-8">{children}</div>
      </main>
    </div>
  );
}

export const authInputClass =
  "mt-1 h-11 w-full rounded-md border border-[var(--rule)] bg-background px-3 text-sm outline-none focus-visible:border-[var(--signal)] disabled:bg-[var(--paper-deep)]";
export const authButtonClass =
  "inline-flex h-11 w-full items-center justify-center rounded-md bg-[var(--ink)] px-4 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-60";
