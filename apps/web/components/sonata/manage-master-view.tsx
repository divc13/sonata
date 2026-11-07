import { Badge } from "@infinitunes/ui/components/badge";
import { ArrowLeft, Lock, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { CopyField } from "~/components/sonata/copy-field";
import { DemoViewerSwitcher } from "~/components/sonata/demo-viewer-switcher";
import { HolderActions } from "~/components/sonata/holder-actions";
import { Stat } from "~/components/sonata/stat";
import type { DemoViewerAccount } from "~/lib/sonata/demo-viewer";
import {
  demoRoleForOwner,
  formatIncludedBalance,
  formatUsdMicro2,
} from "~/lib/sonata/market";
import { asRoute } from "~/lib/utils";

type ManageMasterViewProps = {
  tokenId: string;
  title: string;
  artistName: string;
  artistHandle: string;
  ownerAccountId: string;
  songAccountId: string;
  /** The demo identity the page is currently viewing as. */
  viewerAccountId: DemoViewerAccount;
  /** Result of the server-side owner check; the only thing that grants actions. */
  isOwner: boolean;
  /** Song account balance in micro-USDC, or `null` when the chain read failed. */
  balanceUsdc: string | null;
  /** Active listing price in micro-USDC, or `null` when not listed. */
  listingPriceUsdc: string | null;
  earnings30dUsdc: string;
};

const linkClass =
  "inline-flex w-fit items-center gap-1.5 text-xs font-medium text-muted-foreground underline-offset-4 transition-colors duration-fast hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

const shortId = (accountId: string) =>
  accountId.length <= 24
    ? accountId
    : `${accountId.slice(0, 12)}…${accountId.slice(-8)}`;

/**
 * The manage surface shared by both gate outcomes. It is presentational: the
 * page resolves the master, the cookie and the owner decision, then passes the
 * result in. Non-owners never receive the actions because `isOwner` is false.
 */
export function ManageMasterView({
  tokenId,
  title,
  artistName,
  artistHandle,
  ownerAccountId,
  songAccountId,
  viewerAccountId,
  isOwner,
  balanceUsdc,
  listingPriceUsdc,
  earnings30dUsdc,
}: ManageMasterViewProps) {
  const masterHref = asRoute(`/master/${tokenId}`);
  const ownerRole = demoRoleForOwner(ownerAccountId);
  const balance = formatIncludedBalance(balanceUsdc);

  return (
    <div className="flex flex-col gap-6">
      <header className="overflow-hidden rounded-2xl border border-border/60 bg-card">
        <div className="flex flex-col gap-4 p-5 sm:p-6">
          <Link href={masterHref} className={linkClass}>
            <ArrowLeft aria-hidden className="size-3.5" />
            Back to the public master
          </Link>

          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="outline">Holder only</Badge>
                <Badge
                  variant="outline"
                  className={
                    isOwner ? "border-primary/40 text-primary" : undefined
                  }
                >
                  {isOwner ? "You hold this master" : "Viewing only"}
                </Badge>
              </div>
              <h1 className="font-heading text-2xl leading-tight font-bold tracking-[-0.025em] sm:text-3xl">
                Manage {title}
              </h1>
              <p className="text-sm text-muted-foreground">
                {artistName}{" "}
                <span className="text-muted-foreground/70">{artistHandle}</span>
              </p>
            </div>
          </div>

          <DemoViewerSwitcher viewerAccountId={viewerAccountId} />
          <p className="text-[0.6875rem] leading-4 text-muted-foreground">
            This demo control only chooses which identity the page compares
            against the owner record. The owner check itself always runs on the
            server.
          </p>
        </div>
      </header>

      {isOwner ? (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <section className="flex flex-col gap-6 rounded-2xl border border-border/60 bg-card p-5 sm:p-6">
            <div className="flex items-center gap-2">
              <ShieldCheck aria-hidden className="size-4 text-primary" />
              <h2 className="font-heading text-base font-semibold tracking-[-0.01em]">
                Holding
              </h2>
            </div>

            <dl className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-3">
              <Stat
                label="Current owner"
                value={
                  <span className="font-mono text-sm">
                    {shortId(ownerAccountId)}
                  </span>
                }
                hint={ownerAccountId}
              />
              <Stat
                label="Song account"
                value={
                  <span className="font-mono text-sm">
                    {shortId(songAccountId)}
                  </span>
                }
                hint="Balance and earnings follow this master"
              />
              <Stat
                label="Balance"
                value={balance ?? "—"}
                hint={
                  balance
                    ? "Ready to withdraw"
                    : "The balance is unavailable right now"
                }
              />
              <Stat
                label="Trailing 30 day earnings"
                value={formatUsdMicro2(earnings30dUsdc)}
                hint="Paid into the song account"
              />
              <Stat
                label="Resale"
                value={listingPriceUsdc ? "For sale" : "Not listed"}
                hint={
                  listingPriceUsdc
                    ? formatUsdMicro2(listingPriceUsdc)
                    : "Only you can list this master"
                }
              />
            </dl>

            <div className="grid gap-2 border-t border-border/60 pt-5 sm:grid-cols-2">
              <CopyField label="Owner account" value={ownerAccountId} />
              <CopyField label="Song account" value={songAccountId} />
            </div>
          </section>

          <aside className="flex flex-col gap-4">
            <HolderActions
              tokenId={tokenId}
              role={ownerRole}
              listingPriceUsdc={listingPriceUsdc}
            />

            <section className="flex flex-col gap-2 rounded-xl border border-border/60 bg-card p-5">
              <h2 className="font-heading text-sm font-semibold tracking-[-0.01em]">
                Earnings stay with the master
              </h2>
              <p className="text-xs leading-5 text-muted-foreground">
                Verified listening revenue collects in the song account. It
                moves with the master on resale, and withdrawing pays out what
                is already there.
              </p>
            </section>
          </aside>
        </div>
      ) : (
        <section
          aria-labelledby="manage-blocked-heading"
          className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-card p-5 sm:p-6"
        >
          <span className="flex size-10 items-center justify-center rounded-full bg-fill text-muted-foreground">
            <Lock aria-hidden className="size-5" />
          </span>
          <div className="flex max-w-xl flex-col gap-2">
            <h2
              id="manage-blocked-heading"
              className="font-heading text-xl font-semibold tracking-[-0.02em]"
            >
              Only the current owner can manage this master
            </h2>
            <p className="text-sm leading-6 text-muted-foreground">
              You are viewing as{" "}
              <span className="font-mono text-xs">
                {shortId(viewerAccountId)}
              </span>
              . This master is held by{" "}
              <span className="font-mono text-xs">
                {shortId(ownerAccountId)}
              </span>
              . Earnings, resale and ownership controls stay hidden.
            </p>
            <p className="text-xs leading-5 text-muted-foreground">
              Switch the demo identity above to see the holder view. The public
              master page stays open to everyone.
            </p>
          </div>
          <Link href={masterHref} className={linkClass}>
            <ArrowLeft aria-hidden className="size-3.5" />
            View the public master
          </Link>
        </section>
      )}
    </div>
  );
}
