"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { cn } from "~/lib/utils";

type CopyFieldProps = {
  label: string;
  value: string;
  className?: string;
};

/** A monospace chain value with one quiet copy control and announced feedback. */
export function CopyField({ label, value, className }: CopyFieldProps) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-1.5 rounded-lg border border-border/60 bg-fill/60 px-3 py-2.5",
        className,
      )}
    >
      <span className="text-[0.6875rem] font-medium tracking-[0.01em] text-muted-foreground">
        {label}
      </span>
      <div className="flex min-w-0 items-center gap-2">
        <code className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">
          {value}
        </code>
        <button
          type="button"
          onClick={copy}
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-fast hover:bg-fill-2 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          aria-label={`Copy ${label}`}
        >
          {copied ? (
            <Check aria-hidden="true" className="size-3.5 text-primary" />
          ) : (
            <Copy aria-hidden="true" className="size-3.5" />
          )}
        </button>
      </div>
      <span aria-live="polite" className="sr-only">
        {copied ? `${label} copied` : ""}
      </span>
    </div>
  );
}
