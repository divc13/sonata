import { Wallet } from "lucide-react";

import { cn } from "~/lib/utils";

type WalletChipProps = {
  address: string;
  /** USDC balance, already formatted. */
  balance: string;
  className?: string;
};

/**
 * A presentational account chip: truncated account and balance. Wallet
 * connection lives elsewhere.
 */
export function WalletChip({ address, balance, className }: WalletChipProps) {
  const short =
    address.length > 18
      ? `${address.slice(0, 8)}...${address.slice(-6)}`
      : address;

  return (
    <span
      className={cn(
        "inline-flex h-(--ctl) max-w-full items-center gap-2 rounded-full border border-border/60 bg-card px-3 text-xs font-medium",
        className,
      )}
    >
      <Wallet aria-hidden="true" className="size-3.5 shrink-0 text-primary" />
      <span className="truncate font-mono text-[0.6875rem] text-muted-foreground">
        {short}
      </span>
      <span className="shrink-0 text-foreground tabular-nums">{balance}</span>
    </span>
  );
}
