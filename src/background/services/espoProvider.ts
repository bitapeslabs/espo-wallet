import { Provider } from "alkanesjs";
// Imported from the module directly, NOT the services barrel: the barrel pulls
// in keyringService, which imports apiController, which imports this file.
import storageService from "./storage";
import { networkInfo, networkSlug } from "@/shared/networks";

/** The active network's espo RPC endpoint: the user's override, else default. */
export function espoRpcUrl(): string {
  const network = storageService.appState.network;
  const slug = networkSlug(network);
  return (
    storageService.appState.rpcUrl?.[slug]?.trim() ||
    networkInfo(network).rpcUrl
  ).replace(/\/+$/, "");
}

/**
 * An alkanesjs Provider bound to the active network's espo endpoint. Transfers
 * and swaps pull UTXOs from espo and take an explicit feeRate, so the
 * sandshrew/electrum surfaces aren't exercised (espoUrl is a safe stand-in).
 */
export function espoProvider(): Provider {
  const network = storageService.appState.network;
  const espoUrl = espoRpcUrl();
  return new Provider({
    sandshrewUrl: espoUrl,
    electrumApiUrl: espoUrl,
    espoUrl,
    network,
    explorerUrl: networkInfo(network).explorerUrl,
    btcTicker: "BTC",
  });
}
