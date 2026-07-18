import type { ITransaction } from "@/shared/interfaces/api";
import React, {
  useState,
  useEffect,
  useCallback,
  useContext,
  createContext,
  FC,
} from "react";
import { useControllersState } from "../states/controllerState";
import { useUpdateCurrentAccountBalance } from "../hooks/wallet";
import { useGetCurrentAccount } from "../states/walletState";
import { ss } from ".";
import { useAppState } from "../states/appState";

const isProxy = (obj: any) => {
  return "__isProxy" in obj;
};

/** Must match the per-page limit apiController uses for history. */
const TX_PAGE_SIZE = 50;

const useTransactionManager = (): TransactionManagerContextType | undefined => {
  const currentAccount = useGetCurrentAccount();
  const [lastBlock, setLastBlock] = useState<number>();
  const { apiController } = useControllersState(ss(["apiController"]));
  const { network } = useAppState(ss(["network"]));
  const [feeRates, setFeeRates] = useState<{
    fast: number;
    slow: number;
  }>();

  const [transactions, setTransactions] = useState<ITransaction[] | undefined>(
    undefined
  );
  const [currentPrice, setCurrentPrice] = useState<number | undefined>();
  const updateAccountBalance = useUpdateCurrentAccountBalance();

  const updateTransactions = useCallback(
    async (address: string, force = false) => {
      const receivedItems = await apiController.getTransactions(address);
      if (receivedItems === undefined) return;

      setTransactions((prev) => {
        if ((prev?.length ?? 0) < TX_PAGE_SIZE || force) return receivedItems;

        const currentItemsKeys = new Set(prev!.map((f) => f.txid));
        const receivedItemsKeys = new Set(receivedItems.map((f) => f.txid));
        const intersection = currentItemsKeys.intersection(receivedItemsKeys);
        const difference = receivedItemsKeys.difference(currentItemsKeys);

        return [
          ...receivedItems.filter((f) => difference.has(f.txid)),
          ...prev!,
        ].map((i) => {
          if (intersection.has(i.txid)) {
            return receivedItems.find((f) => f.txid === i.txid)!;
          } else {
            return i;
          }
        });
      });
    },
    [apiController]
  );

  const updateLastBlock = useCallback(async () => {
    const data = await apiController.getLastBlock();
    if (data) setLastBlock(data);
  }, [apiController]);

  const updateFeeRates = useCallback(async () => {
    setFeeRates(await apiController.getFees());
  }, [apiController]);

  const updatePrice = useCallback(async () => {
    const data = await apiController.getBTCPrice();
    if (data !== undefined) {
      setCurrentPrice(data);
    } else {
      setCurrentPrice(undefined);
    }
  }, [apiController]);

  const loadMoreTransactions = useCallback(async () => {
    if (!currentAccount || !currentAccount.address || !transactions) return;
    if (transactions.length < TX_PAGE_SIZE) return;
    // espo paginates by page number; derive the next page from how many full
    // pages we already hold.
    const nextPage = Math.floor(transactions.length / TX_PAGE_SIZE) + 1;
    const additionalTransactions = await apiController.getPaginatedTransactions(
      currentAccount.address,
      nextPage
    );
    if (!additionalTransactions || additionalTransactions.length === 0) return;
    setTransactions((prev) => {
      const seen = new Set((prev ?? []).map((t) => t.txid));
      const fresh = additionalTransactions.filter((t) => !seen.has(t.txid));
      return [...(prev ?? []), ...fresh];
    });
  }, [transactions, apiController, currentAccount]);

  useEffect(() => {
    if (currentAccount?.address) {
      setTransactions(undefined);
      updateTransactions(currentAccount.address, true).catch(console.error);
    }
  }, [currentAccount?.address, updateTransactions]);

  useEffect(() => {
    updateAccountBalance().catch(console.error);
    const interval = setInterval(async () => {
      updateAccountBalance().catch(console.error);
    }, 4000);
    return () => {
      clearInterval(interval);
    };
  }, [updateAccountBalance]);

  useEffect(() => {
    if (!currentAccount?.address) return;

    const interval2 = setInterval(async () => {
      await Promise.all([
        updateTransactions(currentAccount.address!),
        updateLastBlock(),
        updateFeeRates(),
        updatePrice(),
      ]);
    }, 10000);
    return () => {
      clearInterval(interval2);
    };
  }, [
    currentAccount?.address,
    updateFeeRates,
    updateLastBlock,
    updatePrice,
    updateTransactions,
  ]);

  useEffect(() => {
    if (!isProxy(apiController)) return;

    // The network changed (or the app just became ready): drop stale
    // network-scoped data so the previous network's price/tip/history never
    // shows during the switch, then refetch for the current network.
    setCurrentPrice(undefined);
    setLastBlock(undefined);
    setFeeRates(undefined);
    setTransactions(undefined);

    updateFeeRates().catch(console.error);
    updateLastBlock().catch(console.error);
    updatePrice().catch(console.error);
  }, [apiController, updateFeeRates, updateLastBlock, updatePrice, network]);

  if (!currentAccount) return undefined;

  return {
    lastBlock,
    transactions,
    currentPrice,
    loadMoreTransactions,
    feeRates,
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
