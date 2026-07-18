import { useEffect, useRef } from "react";
import {
  QueryClient,
  useQuery,
  useQueryClient,
  type QueryKey,
  type UseQueryResult,
} from "@tanstack/react-query";
import { networkSlug } from "@/shared/networks";
import { useAppState } from "../states/appState";
import { useControllersState } from "../states/controllerState";
import { ss } from ".";

/**
 * espo reads are fresh until explicitly invalidated (see useEspoTipInvalidation),
 * so they never refetch on their own; only the tip-height poll ticks.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity,
      gcTime: 10 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: 1,
    },
  },
});

/** How often the espo tip height is polled. */
const HEIGHT_POLL_MS = 10_000;

/** Prefix marking a query as espo/height-versioned (targeted by invalidation). */
const ESPO_KEY = "espo";

/**
 * The espo chain tip, polled centrally and shared by key across the app.
 * Network-scoped, since each network has its own chain.
 */
export function useEspoHeight(): number | undefined {
  const { apiController } = useControllersState(ss(["apiController"]));
  const { network } = useAppState(ss(["network"]));
  const { data } = useQuery({
    queryKey: ["espo-height", networkSlug(network)],
    queryFn: () => apiController.getLastBlock(),
    refetchInterval: HEIGHT_POLL_MS,
    staleTime: 0,
  });
  return data ?? undefined;
}

/**
 * Watches the tip and, when it ADVANCES, invalidates every espo query so they
 * refetch once at the new block. The FIRST observed height does NOT invalidate —
 * data fetched at startup is already at the current tip, so there's no reason to
 * wait for (or refetch against) the tip. Mount once; returns the height too.
 */
export function useEspoTipInvalidation(): number | undefined {
  const { network } = useAppState(ss(["network"]));
  const height = useEspoHeight();
  const qc = useQueryClient();
  const prev = useRef<number | undefined>(undefined);
  const netRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const slug = networkSlug(network);
    // A network switch changes chains, so the new tip isn't comparable to the
    // old one — treat the first height on the new network as initial.
    if (netRef.current !== slug) {
      netRef.current = slug;
      prev.current = undefined;
    }
    if (height === undefined) return;
    if (prev.current !== undefined && height !== prev.current) {
      qc.invalidateQueries({ queryKey: [ESPO_KEY] });
    }
    prev.current = height;
  }, [height, network, qc]);

  return height;
}

/**
 * A height-versioned espo read. It fires IMMEDIATELY (no waiting on the tip) so
 * the first paint is a single round-trip; a new block later invalidates it via
 * useEspoTipInvalidation. Network is part of the key, so switching networks
 * re-keys and shows the loading state rather than the previous scope's data.
 */
export function useEspoQuery<T>(
  key: QueryKey,
  queryFn: () => Promise<T>,
  options?: { enabled?: boolean }
): UseQueryResult<T> {
  const { network } = useAppState(ss(["network"]));
  return useQuery({
    queryKey: [ESPO_KEY, ...(key as unknown[]), networkSlug(network)],
    queryFn,
    enabled: options?.enabled ?? true,
  });
}

/** Build a height-versioned key (for callers using useInfiniteQuery directly). */
export function espoKey(...parts: unknown[]): unknown[] {
  return [ESPO_KEY, ...parts];
}
