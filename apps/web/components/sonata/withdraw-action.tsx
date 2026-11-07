"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { trpc } from "~/lib/trpc/vanilla";
import { userMessage } from "~/lib/user-message";

type WithdrawActionProps = {
  tokenId: string;
  title: string;
};

/**
 * Demo-only withdraw-all from one master's song account. The account balance
 * lives on chain, so the amount is resolved by `withdraw_all` in the contract.
 * A failure (demo mode off, signing error) is toasted and the row stays put.
 */
export function WithdrawAction({ tokenId, title }: WithdrawActionProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function withdraw() {
    setPending(true);
    try {
      const result = await trpc.sonata.songs.withdraw.mutate({
        role: "nadia",
        tokenId,
      });
      toast.success(`Withdrew from ${title}`, {
        description: `Transaction ${result.txHash}`,
      });
      router.refresh();
    } catch (error) {
      toast.error("Withdrawal failed", {
        description: userMessage(error, "Could not withdraw from this master."),
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={withdraw}
      disabled={pending}
      aria-label={
        pending
          ? `Withdrawing from ${title}`
          : `Withdraw earnings from ${title}`
      }
      className="pointer-coarse:-mx-2 inline-flex items-center rounded-sm pointer-coarse:min-h-11 pointer-coarse:px-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-wait disabled:opacity-60"
    >
      {pending ? "Withdrawing…" : "Withdraw"}
    </button>
  );
}
