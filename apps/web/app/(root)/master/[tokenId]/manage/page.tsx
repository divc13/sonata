import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { Suspense, cache } from "react";

import { ManageMasterView } from "~/components/sonata/manage-master-view";
import { getErrorCode } from "~/lib/error-code";
import { noindexMetadata } from "~/lib/metadata";
import { readSongAccountBalance } from "~/lib/sonata/balances";
import {
  resolveDemoViewerAccount,
  SONATA_DEMO_VIEWER_COOKIE,
} from "~/lib/sonata/demo-viewer";
import { canManageMaster } from "~/lib/sonata/manage-access";
import { selectListingForToken } from "~/lib/sonata/market";
import { api } from "~/lib/trpc/server";

type ManagePageProps = { params: Promise<{ tokenId: string }> };

/** Shared by `generateMetadata` and the page body (one read per request). */
const getMaster = cache(async (tokenId: string) => {
  try {
    return await api.sonata.songs.byId({ tokenId });
  } catch (error) {
    if (getErrorCode(error) === "NOT_FOUND") return null;
    throw error;
  }
});

export async function generateMetadata({
  params,
}: ManagePageProps): Promise<Metadata> {
  const { tokenId } = await params;
  const master = await getMaster(tokenId);

  return {
    ...noindexMetadata,
    title: master ? `Manage ${master.title}` : "Manage master",
    description: "Holder-only controls for a Sonata master.",
  };
}

function ManageSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <div className="h-44 rounded-2xl border border-border/60 bg-card" />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="h-72 rounded-2xl border border-border/60 bg-card" />
        <div className="h-56 rounded-xl border border-border/60 bg-card" />
      </div>
    </div>
  );
}

/**
 * Reads the owner record and the demo viewer cookie, then lets the shared view
 * decide what can be shown. Only `canManageMaster` can grant the actions; the
 * demo control merely changes which account is compared.
 */
async function ManageBody({ params }: ManagePageProps) {
  const { tokenId } = await params;
  const [master, listingRow, cookieStore] = await Promise.all([
    getMaster(tokenId),
    api.sonata.market.listingByToken({ tokenId }),
    cookies(),
  ]);

  if (!master) notFound();

  const balanceUsdc = await readSongAccountBalance(master.subAccount);
  const listing = selectListingForToken(listingRow, master.tokenId);
  const viewerAccountId = resolveDemoViewerAccount(
    cookieStore.get(SONATA_DEMO_VIEWER_COOKIE)?.value,
  );

  return (
    <ManageMasterView
      tokenId={master.tokenId}
      title={master.title}
      artistName={master.artistName}
      artistHandle={master.artistHandle}
      ownerAccountId={master.ownerAccountId}
      songAccountId={master.subAccount}
      viewerAccountId={viewerAccountId}
      isOwner={canManageMaster(viewerAccountId, master.ownerAccountId)}
      balanceUsdc={balanceUsdc}
      listingPriceUsdc={listing?.priceUsdc ?? null}
      earnings30dUsdc={master.earnings30dUsdc}
    />
  );
}

/**
 * `/master/[tokenId]/manage` — holder-only. The public master page stays open;
 * this route renders an explanation instead of the actions for anyone whose
 * demo identity is not the current owner.
 */
export default function ManageMasterPage({ params }: ManagePageProps) {
  return (
    <Suspense fallback={<ManageSkeleton />}>
      <ManageBody params={params} />
    </Suspense>
  );
}
