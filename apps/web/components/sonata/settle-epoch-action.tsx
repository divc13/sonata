"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { trpc } from "~/lib/trpc/vanilla";
import { userMessage } from "~/lib/user-message";

type SettleEpochActionProps = {
  /** `max(chain epoch id) + 1`, or 0 when nothing has settled yet. */
  nextEpochId: number;
};

/** The settlement service reports an empty window with `empty-epoch`. */
const EMPTY_EPOCH = /no verified listening seconds|empty-epoch/i;

/**
 * Demo-only operator action: settle the next epoch at the fixed rate. The
 * router refuses an existing id, an empty listen window and a disabled demo
 * mode; every one of those surfaces as a toast instead of a crash.
 */
export function SettleEpochAction({ nextEpochId }: SettleEpochActionProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function settle() {
    setPending(true);
    setNotice(null);
    try {
      const result = await trpc.sonata.epochs.settle.mutate({
        epochId: nextEpochId,
      });
      toast.success(`Epoch ${result.epoch.id} settled`, {
        description: `Transaction ${result.txHash}`,
      });
      router.refresh();
    } catch (error) {
      const message = userMessage(error, "Could not settle the epoch.");
      if (EMPTY_EPOCH.test(message)) {
        setNotice(
          "No verified listens yet — this epoch has nothing to settle.",
        );
        toast.info("No verified listens yet", {
          description:
            "This epoch has no verified listening seconds. Check back after a few listens.",
        });
      } else {
        toast.error("Could not settle epoch", { description: message });
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <button
        type="button"
        onClick={settle}
        disabled={pending}
        className="inline-flex h-(--ctl) items-center rounded-(--r-ctl) bg-primary px-3.5 text-sm font-semibold text-primary-foreground transition-colors duration-fast hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-wait disabled:opacity-70"
      >
        {pending ? "Settling…" : `Settle epoch ${nextEpochId}`}
      </button>
      <p className="text-xs text-muted-foreground">
        {notice ??
          "Demo operator action. Settles at the computed rate and total."}
      </p>
    </div>
  );
}
