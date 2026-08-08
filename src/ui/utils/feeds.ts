/*
  Shared feed hooks. Every consumer (the History tab, the Unwraps tab, and the
  TabsShell unread watcher) runs the SAME infinite queries - same keys, same
  options - so TanStack shares one cache entry between them and no two views
  can ever disagree about what is confirmed.

  Both feeds also merge the wallet's LOCAL pending txs (just-broadcast, known
  before espo indexes them) and prune those the moment espo reports them.
*/

import { useEffect, useMemo } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import type { IActivityEntry, IUnwrapRequest } from "@/shared/interfaces/api";
import { useControllersState } from "@/ui/states/controllerState";
import { useGetCurrentAccount } from "@/ui/states/walletState";
import { useAppState } from "@/ui/states/appState";
import { espoKey } from "@/ui/utils/query";
import { networkSlug } from "@/shared/networks";
import { ss } from "@/ui/utils";
import {
  pruneLocalPendingTxs,
  useLocalPendingTxs,
} from "@/ui/utils/local-feed";

/**
 * The activity feed: espo's paginated history plus the wallet's local pending
 * txs on top. `entries` is undefined until the first fetch resolves.
 */
export function useActivityFeed() {
  const { apiController } = useControllersState(ss(["apiController"]));
  const { network } = useAppState(ss(["network"]));
  const currentAccount = useGetCurrentAccount();
  const address = currentAccount?.address;
  const slug = networkSlug(network);

  const query = useInfiniteQuery({
    queryKey: espoKey("activity", address, slug),
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      apiController.getActivity(address as string, pageParam),
    getNextPageParam: (lastPage, allPages) =>
      lastPage && lastPage.length > 0 ? allPages.length + 1 : undefined,
    enabled: !!address,
    refetchInterval: 10_000,
  });

  const localPending = useLocalPendingTxs(slug, address ?? "");

  const entries = useMemo(() => {
    if (!query.isFetched) return undefined;
    const seen = new Set<string>();
    const feed: IActivityEntry[] = [];
    for (const page of query.data?.pages ?? []) {
      for (const e of page ?? []) {
        if (!seen.has(e.txid)) {
          seen.add(e.txid);
          feed.push(e);
        }
      }
    }
    const local = localPending.filter((e) => !seen.has(e.txid));
    return [...local, ...feed];
  }, [query.data, query.isFetched, localPending]);

  // Local entries retire the moment espo's feed reports their txid.
  useEffect(() => {
    if (!address || !query.isFetched) return;
    const feedIds = new Set<string>();
    for (const page of query.data?.pages ?? []) {
      for (const e of page ?? []) feedIds.add(e.txid);
    }
    pruneLocalPendingTxs(slug, address, feedIds);
  }, [query.data, query.isFetched, slug, address]);

  return { query, entries };
}

/**
 * The unwrap requests view: espo's subfrost index, back-filled by the activity
 * feed for unwraps espo cannot know yet (mempool ones as "unconfirmed",
 * just-confirmed ones as "confirmed" until the index catches up).
 */
export function useUnwraps() {
  const { apiController } = useControllersState(ss(["apiController"]));
  const { network } = useAppState(ss(["network"]));
  const currentAccount = useGetCurrentAccount();
  const address = currentAccount?.address;

  const { entries } = useActivityFeed();

  const query = useInfiniteQuery({
    queryKey: espoKey("unwraps", address, networkSlug(network)),
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      apiController.getUnwrapRequests(address as string, pageParam),
    getNextPageParam: (lastPage, allPages) =>
      lastPage && lastPage.length > 0 ? allPages.length + 1 : undefined,
    enabled: !!address,
    refetchInterval: 10_000,
  });

  const rows = useMemo(() => {
    if (!query.isFetched) return undefined;
    const seen = new Set<string>();
    const indexed: IUnwrapRequest[] = [];
    for (const page of query.data?.pages ?? []) {
      for (const r of page ?? []) {
        if (!seen.has(r.txid)) {
          seen.add(r.txid);
          indexed.push(r);
        }
      }
    }
    const extra: IUnwrapRequest[] = (entries ?? [])
      .filter((e) => e.kind === "unwrap" && !seen.has(e.txid))
      .map((e) => {
        const leg = e.legs.find((l) => l.assetId !== "btc") ?? e.legs[0];
        return {
          txid: e.txid,
          vout: 0,
          timestamp: e.timestamp,
          amount: (leg?.delta ?? "0").replace("-", ""),
          state: e.confirmed
            ? ("confirmed" as const)
            : ("unconfirmed" as const),
        };
      });
    return [
      ...extra.filter((r) => r.state === "unconfirmed"),
      ...extra.filter((r) => r.state !== "unconfirmed"),
      ...indexed,
    ];
  }, [query.data, query.isFetched, entries]);

  return { query, rows };
}
