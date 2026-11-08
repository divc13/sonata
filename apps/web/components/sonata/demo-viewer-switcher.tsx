"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import {
  DEMO_VIEWER_OPTIONS,
  type DemoViewerAccount,
} from "~/lib/sonata/demo-viewer";
import { selectDemoViewer } from "~/lib/sonata/demo-viewer-actions";
import { cn } from "~/lib/utils";

type DemoViewerSwitcherProps = {
  viewerAccountId: DemoViewerAccount;
};

/**
 * The only surface that names demo identities. It writes the demo viewer cookie
 * and refreshes; the page's owner check stays on the server and is unaffected by
 * anything this control does beyond choosing the account being compared.
 */
export function DemoViewerSwitcher({
  viewerAccountId,
}: DemoViewerSwitcherProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function choose(accountId: DemoViewerAccount) {
    if (accountId === viewerAccountId || pending) return;
    startTransition(async () => {
      await selectDemoViewer(accountId);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-dashed border-border/70 bg-fill/40 px-3 py-2.5">
      <span className="text-[0.6875rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
        View as
      </span>
      <fieldset className="m-0 flex min-w-0 items-center gap-1 border-0 p-0">
        <legend className="sr-only">Viewer</legend>
        {DEMO_VIEWER_OPTIONS.map((option) => {
          const active = option.accountId === viewerAccountId;
          return (
            <button
              key={option.accountId}
              type="button"
              aria-pressed={active}
              title={`${option.detail} · ${option.accountId}`}
              disabled={pending}
              onClick={() => choose(option.accountId)}
              className={cn(
                "inline-flex h-7 items-center rounded-(--r-ctl) px-2.5 text-xs font-semibold transition-colors duration-fast focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-wait disabled:opacity-60",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-fill hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </fieldset>
      <span className="font-mono text-[0.6875rem] text-muted-foreground">
        {viewerAccountId}
      </span>
    </div>
  );
}
