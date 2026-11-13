"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { toast } from "sonner";

import {
  formatUsdcMicro,
  truncateAccountId,
  WALLET_CONNECT_CANCELLED,
  type WalletTransaction,
} from "~/lib/sonata/wallet";
import {
  clearWalletAccount,
  getServerWalletAccountSnapshot,
  getWalletAccountSnapshot,
  subscribeWalletAccount,
  writeWalletAccount,
} from "~/lib/sonata/wallet-store";
import { trpc } from "~/lib/trpc/vanilla";
import { userMessage } from "~/lib/user-message";

type WalletContextValue = {
  /** The connected testnet account, or `null`. */
  accountId: string | null;
  /** `mira…testnet`, for compact surfaces. */
  shortAccount: string | null;
  /** `usdc.ft_balance_of` as micro-USDC; `null` until it is read. */
  balanceUsdc: string | null;
  /** `$25.00`, or `—` while the balance is unknown. */
  balanceLabel: string;
  /** The modal is loading or the visitor is approving the connection. */
  connecting: boolean;
  /** A wallet signature is in flight. */
  signing: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  refreshBalance: () => Promise<void>;
  /** Signs with the connected wallet; rejects when none is connected. */
  sign: (transactions: readonly WalletTransaction[]) => Promise<void>;
};

const WalletContext = createContext<WalletContextValue | null>(null);

/** Dynamic import keeps the selector chunk (and its CSS) out of first load. */
const loadSelector = () => import("~/lib/sonata/wallet-selector");

function isNotSignedIn(error: unknown): boolean {
  return error instanceof Error && /not signed in/i.test(error.message);
}

/**
 * The connected NEAR testnet wallet, shared by the header, the sidebar and every
 * page action. The account comes from the `sonata_wallet` cookie (public
 * identity), the balance from `wallet.balance`, and signing is always the
 * visitor's own wallet.
 */
export function WalletProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const accountId = useSyncExternalStore(
    subscribeWalletAccount,
    getWalletAccountSnapshot,
    getServerWalletAccountSnapshot,
  );

  const [balance, setBalance] = useState<{
    accountId: string;
    micro: string | null;
  } | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [signing, setSigning] = useState(false);

  const refreshBalance = useCallback(async () => {
    if (!accountId) return;

    try {
      const micro = await trpc.sonata.wallet.balance.query({ accountId });
      setBalance({ accountId, micro });
    } catch {
      /* A chain hiccup shows as `—`; the action itself re-checks the chain. */
      setBalance({ accountId, micro: null });
    }
  }, [accountId]);

  useEffect(() => {
    // Deferred one tick, like the pass entitlement: the effect stays setup for
    // an external read instead of a synchronous setState.
    const kick = window.setTimeout(() => void refreshBalance(), 0);
    return () => window.clearTimeout(kick);
  }, [refreshBalance]);

  async function connect() {
    if (connecting) return;
    setConnecting(true);

    try {
      const { connectWallet } = await loadSelector();
      const connected = await connectWallet();
      writeWalletAccount(connected);
      router.refresh();
    } catch (error) {
      /* Closing the modal is not a failure worth a toast. */
      if (
        error instanceof Error &&
        error.message === WALLET_CONNECT_CANCELLED
      ) {
        return;
      }
      toast.error("Could not connect a wallet", {
        description: userMessage(
          error,
          "Open your NEAR testnet wallet and try again.",
        ),
      });
    } finally {
      setConnecting(false);
    }
  }

  async function disconnect() {
    try {
      const { disconnectWallet } = await loadSelector();
      await disconnectWallet();
    } catch {
      /* The cookie is the identity this app reads; clear it regardless. */
    } finally {
      clearWalletAccount();
      setBalance(null);
      router.refresh();
    }
  }

  async function sign(transactions: readonly WalletTransaction[]) {
    if (!accountId) {
      throw new Error("Connect your NEAR testnet wallet to continue.");
    }
    if (signing) return;

    setSigning(true);
    try {
      const { signWalletTransactions } = await loadSelector();
      await signWalletTransactions(transactions);
    } catch (error) {
      if (isNotSignedIn(error)) {
        toast.error("Wallet session expired", {
          description: "Connect your wallet again, then retry.",
        });
        await connect();
      }
      throw error;
    } finally {
      setSigning(false);
    }
  }

  const current = accountId
    ? balance?.accountId === accountId
      ? balance.micro
      : null
    : null;

  const value: WalletContextValue = {
    accountId,
    shortAccount: accountId ? truncateAccountId(accountId) : null,
    balanceUsdc: current,
    balanceLabel: formatUsdcMicro(current),
    connecting,
    signing,
    connect,
    disconnect,
    refreshBalance,
    sign,
  };

  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  );
}

/** The wallet context. Must be used inside `<WalletProvider>`. */
export function useWallet(): WalletContextValue {
  const value = useContext(WalletContext);
  if (!value) {
    throw new Error("useWallet must be used inside <WalletProvider>.");
  }
  return value;
}
