import React, {
  useState,
  useCallback,
  useContext,
  createContext,
  useEffect,
  useRef,
  FC,
} from "react";
import type { IPortfolio, IPortfolioAsset } from "@/shared/interfaces/api";
import { useGetCurrentAccount } from "../states/walletState";
import { useControllersState } from "../states/controllerState";
import { useAppState } from "../states/appState";
import { ss } from ".";

const isProxy = (obj: any) => "__isProxy" in obj;

/** How often the portfolio (balances + USD values) is refreshed. */
const PORTFOLIO_POLL_MS = 15000;

/**
 * Asset display wiring. Balances and their USD values come from espo's
 * `ammdata.get_portfolio_stats` (mainnet only; the module is absent on
 * regtest, where `portfolio` stays undefined and the UI shows BTC alone).
 */
const useAssetManager = (): AssetManagerContextType | undefined => {
  const currentAccount = useGetCurrentAccount();
  const { apiController } = useControllersState(ss(["apiController"]));
  const { network } = useAppState(ss(["network"]));

  // `portfolio === undefined` means "not loaded yet" (first load or reset on an
  // account/network switch); it is the UI's loading signal. Polls refresh it in
  // place without clearing it, so they never flash a skeleton.
  const [portfolio, setPortfolio] = useState<IPortfolio | undefined>(undefined);
  // Invalidation token: bumped on every account/network change so an in-flight
  // fetch from a previous network/account can never apply stale results.
  const reqRef = useRef(0);

  const updatePortfolio = useCallback(async () => {
    const address = currentAccount?.address;
    if (!address) return;
    const token = reqRef.current;
    const data = await apiController.getPortfolioStats(address);
    if (token !== reqRef.current) return; // superseded by a newer switch
    setPortfolio(data);
  }, [apiController, currentAccount?.address]);

  const resetProvider = useCallback(() => {
    reqRef.current++;
    setPortfolio(undefined);
  }, []);

  // Refetch the portfolio when the account or network changes, then poll.
  useEffect(() => {
    if (!isProxy(apiController)) return;
    if (!currentAccount?.address) return;
    reqRef.current++;
    setPortfolio(undefined);
    updatePortfolio().catch(console.error);
    const interval = setInterval(() => {
      updatePortfolio().catch(console.error);
    }, PORTFOLIO_POLL_MS);
    return () => clearInterval(interval);
  }, [apiController, currentAccount?.address, network, updatePortfolio]);

  if (!currentAccount) return undefined;

  return {
    portfolio,
    alkanes: portfolio?.alkanes ?? [],
    updatePortfolio,
    resetProvider,
  };
};

interface AssetManagerContextType {
  portfolio: IPortfolio | undefined;
  alkanes: IPortfolioAsset[];
  updatePortfolio: () => Promise<void>;
  resetProvider: () => void;
}

const AssetManagerContext = createContext<AssetManagerContextType | undefined>(
  undefined
);

export const AssetManagerProvider: FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const assetManager = useAssetManager();

  return (
    <AssetManagerContext.Provider value={assetManager}>
      {children}
    </AssetManagerContext.Provider>
  );
};

export const useAssetManagerContext = (): AssetManagerContextType => {
  const context = useContext(AssetManagerContext);
  if (!context) {
    return {
      portfolio: undefined,
      alkanes: [],
      updatePortfolio: async () => {},
      resetProvider: () => {},
    };
  }
  return context;
};
