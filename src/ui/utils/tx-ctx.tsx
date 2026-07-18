import type { ITransaction } from "@/shared/interfaces/api";
import React, {
  useCallback,
  useContext,
  createContext,
  useEffect,
  useMemo,
  FC,
} from "react";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { networkSlug } from "@/shared/networks";
import { useControllersState } from "../states/controllerState";
import { useGetCurrentAccount, useWalletState } from "../states/walletState";
import { ss } from ".";
import { useAppState } from "../states/appState";
import { espoKey, useEspoQuery, useEspoTipInvalidation } from "./query";

/** Must match the per-page limit apiController uses for history. */
const TX_PAGE_SIZE = 50;

/**
 * Chain-tip, BTC price, fees, history and the derived account balance, all
 * served through height-versioned react-query so identical espo reads within a
 * block are cached and refetch once per new block. Network + address are part
 * of every key, so switching either re-keys and shows the loading state rather
 * than the previous scope's data.
 */
const useTransactionManager = (): TransactionManagerContextType | undefined => {
  const currentAccount = useGetCurrentAccount();
  const { apiController } = useControllersState(ss(["apiController"]));
  const { network } = useAppState(ss(["network"]));
  const { updateSelectedAccount } = useWalletState(ss(["updateSelectedAccount"]));
  const qc = useQueryClient();
  const address = currentAccount?.address;

  // Single instance drives the tip poll + invalidates espo queries on new blocks.
  const lastBlock = useEspoTipInvalidation();

  const { data: currentPrice } = useEspoQuery(["btc-price"], () =>
    apiController.getBTCPrice()
  );

  // Fee estimates are mempool-driven and drift between blocks, so they poll
  // fresh on an interval rather than being versioned/cached by height.
  const { data: feeRates } = useQuery({
    queryKey: ["fees", networkSlug(network)],
    queryFn: () => apiController.getFees(),
    refetchInterval: 20_000,
    staleTime: 0,
  });

  // Derived account balance (summed spendable outpoints) synced into wallet
  // state so `currentAccount.balance` stays current.
  const { data: accountStats } = useEspoQuery(
    ["account-stats", address],
    () => apiController.getAccountStats(address as string),
    { enabled: !!address }
  );
  useEffect(() => {
    if (accountStats?.balance != null) {
      updateSelectedAccount({ balance: accountStats.balance }).catch(
        console.error
      );
    }
  }, [accountStats, updateSelectedAccount]);

  // Paginated history: fires immediately, refetches on new blocks (invalidation).
  const txQuery = useInfiniteQuery({
    queryKey: espoKey("transactions", address, networkSlug(network)),
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      pageParam <= 1
        ? apiController.getTransactions(address as string)
        : apiController.getPaginatedTransactions(address as string, pageParam),
    getNextPageParam: (lastPage, allPages) =>
      lastPage && lastPage.length >= TX_PAGE_SIZE
        ? allPages.length + 1
        : undefined,
    enabled: !!address,
  });

  const transactions = useMemo(() => {
    if (!txQuery.data) return undefined;
    const seen = new Set<string>();
    const out: ITransaction[] = [];
    for (const page of txQuery.data.pages) {
      for (const tx of page ?? []) {
        if (!seen.has(tx.txid)) {
          seen.add(tx.txid);
          out.push(tx);
        }
      }
    }
    return out;
  }, [txQuery.data]);

  const loadMoreTransactions = useCallback(async () => {
    if (txQuery.hasNextPage && !txQuery.isFetchingNextPage) {
      await txQuery.fetchNextPage();
    }
  }, [txQuery]);

  const updateTransactions = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: ["transactions"] });
  }, [qc]);

  if (!currentAccount) return undefined;

  return {
    lastBlock,
    transactions,
    currentPrice: currentPrice ?? undefined,
    loadMoreTransactions,
    feeRates: feeRates ?? undefined,
    updateTransactions,
  };
};

interface TransactionManagerContextType {
  lastBlock?: number;
  transactions: ITransaction[] | undefined;
  currentPrice: number | undefined;
  loadMoreTransactions: () => Promise<void>;
  feeRates?: {
    fast: number;
    slow: number;
  };
  updateTransactions: (address: string, reset?: boolean) => Promise<void>;
}

const TransactionManagerContext = createContext<
  TransactionManagerContextType | undefined
>(undefined);

export const TransactionManagerProvider: FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const transactionManager = useTransactionManager();

  return (
    <TransactionManagerContext.Provider value={transactionManager}>
      {children}
    </TransactionManagerContext.Provider>
  );
};

export const useTransactionManagerContext =
  (): TransactionManagerContextType => {
    const context = useContext(TransactionManagerContext);
    if (!context) {
      return {
        transactions: undefined,
        currentPrice: undefined,
        feeRates: {
          slow: 0,
          fast: 0,
        },
        lastBlock: 0,
        loadMoreTransactions: async () => {},
        updateTransactions: async () => {},
      };
    }
    return context;
  };
