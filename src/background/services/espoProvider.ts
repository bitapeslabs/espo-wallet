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
 * An alkanesjs Provider bound to the active network. espo carries the index,
 * UTXO selection, fee estimates and broadcast; metashrew/kirby carries contract
 * views and simulation (the frBTC premium read, for one). Constructed fresh on
 * every call so it always reflects the current network + RPC override.
 */
export function espoProvider(): Provider {
  const network = storageService.appState.network;
  return new Provider({
    metashrewUrl: networkInfo(network).metashrewUrl,
    espoUrl: espoRpcUrl(),
    network,
    btcTicker: "BTC",
  });
}
