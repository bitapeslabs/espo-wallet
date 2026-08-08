/*
  Wallet-local feed knowledge, backed by localStorage:

  1. PENDING LOCAL TXS - transactions this wallet just signed and broadcast.
     The tx shape and txid are known before espo indexes them, so Activity and
     Unwraps can show them instantly; each is pruned the moment the espo feed
     reports its txid (or after a TTL, in case the broadcast never propagated).

  2. UNREAD COUNTERS - per tab (History / Unwraps), per network+address. Every
     txid never seen before bumps the tab's counter unless the tab is being
     viewed; viewing a tab clears it. The navbar renders the counts as badges.

  A module-level version counter + subscriber set makes the storage reactive
  (useSyncExternalStore) without pulling in another state library.
*/

import { useMemo, useSyncExternalStore } from "react";
import type { IActivityEntry } from "@/shared/interfaces/api";

const PENDING_KEY = "espo_local_pending_txs";
const UNREAD_PREFIX = "espo_unread";
const PENDING_TTL_MS = 6 * 60 * 60 * 1000;
const SEEN_CAP = 400;

type StoredPending = {
  scope: string;
  addedAt: number;
  entry: IActivityEntry;
  /** The broadcast tx hex: lets the overview render before espo indexes it. */
  rawTx?: string;
};

type UnreadTab = "history" | "unwraps";

interface UnreadState {
  count: number;
  seen: string[];
}

/* ------------------------------------------------ reactivity plumbing */

let version = 0;
const listeners = new Set<() => void>();

function emit(): void {
  version++;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const scopeOf = (network: string, address: string) => `${network}:${address}`;

/* ------------------------------------------------ pending local txs */

function readPending(): StoredPending[] {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    const list = raw ? (JSON.parse(raw) as StoredPending[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writePending(list: StoredPending[]): void {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(list));
  } catch {
    // quota/serialization failures just lose the optimistic entry
  }
  emit();
}

/** Record a just-broadcast tx so the feeds can show it before espo does. */
export function addLocalPendingTx(
  network: string,
  address: string,
  entry: IActivityEntry,
  rawTx?: string
): void {
  if (!entry.txid) return;
  const scope = scopeOf(network, address);
  const list = readPending().filter(
    (p) => !(p.scope === scope && p.entry.txid === entry.txid)
  );
  list.push({
    scope,
    addedAt: Date.now(),
    entry,
    ...(rawTx ? { rawTx } : {}),
  });
  writePending(list);
}

/** Every stored raw hex for the scope (txid + hex pairs, newest first). */
export function getLocalPendingRawTxs(
  network: string,
  address: string
): { txid: string; rawTx: string }[] {
  const scope = scopeOf(network, address);
  return readPending()
    .filter((p) => p.scope === scope && p.rawTx)
    .sort((a, b) => b.addedAt - a.addedAt)
    .map((p) => ({ txid: p.entry.txid, rawTx: p.rawTx as string }));
}

/** The stored raw hex of a just-broadcast tx, while it is still tracked. */
export function getLocalPendingRawTx(
  network: string,
  address: string,
  txid: string
): string | undefined {
  const scope = scopeOf(network, address);
  return readPending().find(
    (p) => p.scope === scope && p.entry.txid === txid
  )?.rawTx;
}

export function getLocalPendingTxs(
  network: string,
  address: string
): IActivityEntry[] {
  const scope = scopeOf(network, address);
  const now = Date.now();
  return readPending()
    .filter((p) => p.scope === scope && now - p.addedAt < PENDING_TTL_MS)
    .sort((a, b) => b.addedAt - a.addedAt)
    .map((p) => p.entry);
}

/** Drop local entries the espo feed now knows about (plus expired ones). */
export function pruneLocalPendingTxs(
  network: string,
  address: string,
  feedTxids: Set<string>
): void {
  const scope = scopeOf(network, address);
  const now = Date.now();
  const list = readPending();
  const next = list.filter((p) => {
    if (p.scope !== scope) return true;
    return !feedTxids.has(p.entry.txid) && now - p.addedAt < PENDING_TTL_MS;
  });
  if (next.length !== list.length) writePending(next);
}

/** Reactive view of the local pending entries for one scope. */
export function useLocalPendingTxs(
  network: string,
  address: string
): IActivityEntry[] {
  const v = useSyncExternalStore(subscribe, () => version);
  return useMemo(
    () => getLocalPendingTxs(network, address),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [v, network, address]
  );
}

/* ------------------------------------------------ unread counters */

function unreadKey(tab: UnreadTab, scope: string): string {
  return `${UNREAD_PREFIX}_${tab}_${scope}`;
}

function readUnread(tab: UnreadTab, scope: string): UnreadState | undefined {
  try {
    const raw = localStorage.getItem(unreadKey(tab, scope));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as UnreadState;
    if (typeof parsed?.count !== "number" || !Array.isArray(parsed?.seen)) {
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}

function writeUnread(tab: UnreadTab, scope: string, state: UnreadState): void {
  try {
    localStorage.setItem(unreadKey(tab, scope), JSON.stringify(state));
  } catch {
    // ignore
  }
  emit();
}

export function getUnreadCount(
  tab: UnreadTab,
  network: string,
  address: string
): number {
  return readUnread(tab, scopeOf(network, address))?.count ?? 0;
}

/**
 * Reconcile a tab's unread state with the txids currently in its feed.
 * `viewing` (the tab is open) marks everything seen and clears the count;
 * otherwise every never-seen txid bumps it. The very first sync for a scope
 * only baselines (nothing pre-existing counts as unread).
 */
export function syncUnread(
  tab: UnreadTab,
  network: string,
  address: string,
  txids: string[],
  viewing: boolean
): void {
  const scope = scopeOf(network, address);
  const prev = readUnread(tab, scope);

  if (!prev) {
    writeUnread(tab, scope, { count: 0, seen: txids.slice(-SEEN_CAP) });
    return;
  }

  const seen = new Set(prev.seen);
  const fresh = txids.filter((id) => !seen.has(id));
  if (viewing) {
    if (prev.count === 0 && !fresh.length) return;
    writeUnread(tab, scope, {
      count: 0,
      seen: [...prev.seen, ...fresh].slice(-SEEN_CAP),
    });
    return;
  }

  if (!fresh.length) return;
  writeUnread(tab, scope, {
    count: prev.count + fresh.length,
    seen: [...prev.seen, ...fresh].slice(-SEEN_CAP),
  });
}

/** Reactive unread count for a navbar badge. */
export function useUnreadCount(
  tab: UnreadTab,
  network: string,
  address: string
): number {
  return useSyncExternalStore(subscribe, () =>
    getUnreadCount(tab, network, address)
  );
}
