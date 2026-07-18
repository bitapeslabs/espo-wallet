import React, { useCallback, useContext, createContext, FC } from "react";
import type { IPortfolio, IPortfolioAsset } from "@/shared/interfaces/api";
import { useQueryClient } from "@tanstack/react-query";
import { useGetCurrentAccount } from "../states/walletState";
import { useControllersState } from "../states/controllerState";
import { ss } from ".";
import { useEspoQuery } from "./query";

/**
 * Asset display wiring. Balances and their USD values come from espo's
 * `ammdata.get_portfolio_stats`, now served through a height-versioned query:
 * it refetches once per block and is cached in between. `portfolio === undefined`
 * still means "not loaded yet" (initial load or an account/network switch, both
 * of which change the query key), so it stays the UI's loading signal.
 */
const useAssetManager = (): AssetManagerContextType | undefined => {
  const currentAccount = useGetCurrentAccount();
  const { apiController } = useControllersState(ss(["apiController"]));
  const address = currentAccount?.address;
  const qc = useQueryClient();

  const { data: portfolio } = useEspoQuery<IPortfolio | undefined>(
    ["portfolio", address],
    () => apiController.getPortfolioStats(address as string),
    { enabled: !!address }
  );

  // Force an immediate refresh (used after actions that change balances).
  const updatePortfolio = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: ["portfolio"] });
  }, [qc]);

  // Drop cached portfolios (network switches already re-key automatically).
  const resetProvider = useCallback(() => {
    qc.removeQueries({ queryKey: ["portfolio"] });
  }, [qc]);

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
