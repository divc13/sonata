"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { getErrorCode } from "~/lib/error-code";
import { trpc } from "~/lib/trpc/vanilla";
import { userMessage } from "~/lib/user-message";

type PassBuyActionProps = {
  /** The cache says the listener already has a pass that has not expired. */
  active: boolean;
};

/**
 * Chain failures arrive as PRECONDITION_FAILED with a readable message from
 * `rethrowSonataError`; other codes go through the shared safety filter.
 */
function passErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (getErrorCode(error) === "PRECONDITION_FAILED" && message) return message;
  return userMessage(
    error,
    "The pass could not be purchased. Please try again.",
  );
}

/**
 * Demo-gated pass purchase. The server signs with the listener role and the
 * contract is the source of truth; the page refetches its cache row after the
 * transaction lands. A disabled demo mode arrives as a FORBIDDEN toast, so the
 * checkout never crashes.
 */
export function PassBuyAction({ active }: PassBuyActionProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function buy() {
    if (active || pending) return;
    setPending(true);
    try {
      const result = await trpc.sonata.pass.buy.mutate({ role: "listener" });
      toast.success("Pass active for 30 days", {
        description: `Receipt ${result.txHash}`,
      });
      window.dispatchEvent(new CustomEvent("sonata:pass-changed"));
      router.refresh();
    } catch (error) {
      toast.error("Could not buy the pass", {
        description: passErrorMessage(error),
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={buy}
      disabled={active || pending}
      aria-busy={pending}
      className="inline-flex h-(--ctl-lg) items-center justify-center rounded-(--r-ctl) bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors duration-fast hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-70"
    >
      {active ? "Pass active" : pending ? "Opening your pass…" : "Get 30 days"}
    </button>
  );
}
