/*
  Port of espo's mempool contract projections (src/runtime/mempool_projection)
  for the two contracts whose behavior is predictable enough to estimate
  without a trace: frBTC (wrap/unwrap) and the oyl AMM (swaps). Espo also
  models fire bonds; deliberately not ported.

  A projector instance carries MUTABLE reserve state cloned at creation, so
  consecutive hops/protostones inside one transaction move the price exactly
  like espo's per-block registry does. Every rule returns undefined when the
  call wouldn't succeed (wrong shape, insufficient incoming, empty pool), in
  which case the edict engine falls back to its plain pass-through behavior.
*/

import type { Cellpack } from "@/shared/utils/cellpack";

export type ProjSheet = Map<string, bigint>;

export interface PoolSnapshot {
  base: string;
  quote: string;
  baseReserve: bigint;
  quoteReserve: bigint;
}

export interface ContractProjectionData {
  /** frBTC's id, "32:0". */
  frbtcId: string;
  /** The AMM factory id, "block:tx". */
  factoryId?: string;
  /** The frBTC signer script_pubkey hex (lowercase, no 0x). */
  signerScriptHex?: string;
  /** Live pool reserves keyed by pool id. */
  pools: Map<string, PoolSnapshot>;
}

export interface ProjectionVout {
  scriptHex: string;
  value: number;
}

const FEE_DENOMINATOR = 1000n;
const DEFAULT_TOTAL_FEE_PER_1000 = 10n;

/* espo's pool opcodes */
const POOL_ADD_LIQUIDITY = 1n;
const POOL_WITHDRAW_AND_BURN = 2n;
const POOL_SWAP = 3n;
const POOL_PASS_THROUGH = new Set([10n, 20n, 21n, 50n, 97n, 98n, 99n, 999n]);

/* espo's factory opcodes */
const FACTORY_CREATE_NEW_POOL = 1n;
const FACTORY_ADD_LIQUIDITY = 11n;
const FACTORY_BURN = 12n;
const FACTORY_SWAP_EXACT_IN = 13n;
const FACTORY_SWAP_EXACT_OUT = 14n;
const FACTORY_SWAP_EXACT_IN_IMPLICIT = 29n;
const FACTORY_PASS_THROUGH = new Set([2n, 3n, 4n, 10n, 21n, 50n]);

const FRBTC_WRAP = 77n;
const FRBTC_UNWRAP = 78n;

const cloneSheet = (s: ProjSheet): ProjSheet => new Map(s);

const addToSheet = (s: ProjSheet, id: string, amount: bigint): void => {
  if (amount <= 0n) return;
  s.set(id, (s.get(id) ?? 0n) + amount);
};

/** Remove up to `amount`; returns what was actually taken (espo semantics). */
const removeFromSheet = (s: ProjSheet, id: string, amount: bigint): bigint => {
  const have = s.get(id) ?? 0n;
  const taken = have < amount ? have : amount;
  const left = have - taken;
  if (left <= 0n) s.delete(id);
  else s.set(id, left);
  return taken;
};

function getAmountOut(
  amountIn: bigint,
  reserveIn: bigint,
  reserveOut: bigint
): bigint | undefined {
  if (amountIn <= 0n || reserveIn <= 0n || reserveOut <= 0n) return undefined;
  const amountInWithFee =
    amountIn * (FEE_DENOMINATOR - DEFAULT_TOTAL_FEE_PER_1000);
  const numerator = amountInWithFee * reserveOut;
  const denominator = reserveIn * FEE_DENOMINATOR + amountInWithFee;
  const out = numerator / denominator;
  return out > 0n && out < reserveOut ? out : undefined;
}

function getAmountIn(
  amountOut: bigint,
  reserveIn: bigint,
  reserveOut: bigint
): bigint | undefined {
  if (amountOut <= 0n || reserveIn <= 0n || amountOut >= reserveOut) {
    return undefined;
  }
  const numerator = reserveIn * amountOut * FEE_DENOMINATOR;
  const denominator =
    (reserveOut - amountOut) * (FEE_DENOMINATOR - DEFAULT_TOTAL_FEE_PER_1000);
  return numerator / denominator + 1n;
}

/**
 * [len, (block, tx)*len, ...] with the opcode already stripped. Opcode 29
 * (implicit) infers the input token from the attached alkane and may name
 * only the REMAINING hops, so a single-hop path can be one id (`minLen` 1);
 * ops 13/14 always carry the full path (`minLen` 2).
 */
function parsePath(
  inputs: bigint[],
  minLen: number
): { path: string[]; cursor: number } | undefined {
  const len = Number(inputs[0] ?? 0n);
  if (!Number.isFinite(len) || len < minLen) return undefined;
  const path: string[] = [];
  let cursor = 1;
  for (let i = 0; i < len; i++) {
    const block = inputs[cursor];
    const tx = inputs[cursor + 1];
    if (block === undefined || tx === undefined) return undefined;
    path.push(`${block}:${tx}`);
    cursor += 2;
  }
  return { path, cursor };
}

/**
 * A per-transaction projector: espo's rule registry with the fire rule left
 * out. Returns the protostone's transformed sheet, or undefined to fall back.
 */
export function createContractProjector(
  data: ContractProjectionData,
  vouts: ProjectionVout[]
): (cell: Cellpack, incoming: ProjSheet) => ProjSheet | undefined {
  const reserves = new Map<string, PoolSnapshot>();
  for (const [id, p] of data.pools) reserves.set(id, { ...p });
  const poolsByPair = new Map<string, string>();
  for (const [id, p] of reserves) {
    poolsByPair.set(`${p.base}|${p.quote}`, id);
    poolsByPair.set(`${p.quote}|${p.base}`, id);
  }
  const signer = data.signerScriptHex?.toLowerCase();
  const scripts = vouts.map((v) => v.scriptHex.toLowerCase());

  const orderedReserves = (
    snapshot: PoolSnapshot,
    tokenIn: string,
    tokenOut: string
  ): [bigint, bigint] | undefined => {
    if (snapshot.base === tokenIn && snapshot.quote === tokenOut) {
      return [snapshot.baseReserve, snapshot.quoteReserve];
    }
    if (snapshot.quote === tokenIn && snapshot.base === tokenOut) {
      return [snapshot.quoteReserve, snapshot.baseReserve];
    }
    return undefined;
  };

  const amountOutForPair = (
    tokenIn: string,
    tokenOut: string,
    amountIn: bigint,
    pool: Map<string, PoolSnapshot>
  ): bigint | undefined => {
    const poolId = poolsByPair.get(`${tokenIn}|${tokenOut}`);
    const snapshot = poolId ? pool.get(poolId) : undefined;
    if (!snapshot) return undefined;
    const ordered = orderedReserves(snapshot, tokenIn, tokenOut);
    if (!ordered) return undefined;
    return getAmountOut(amountIn, ordered[0], ordered[1]);
  };

  const amountInForPair = (
    tokenIn: string,
    tokenOut: string,
    amountOut: bigint,
    pool: Map<string, PoolSnapshot>
  ): bigint | undefined => {
    const poolId = poolsByPair.get(`${tokenIn}|${tokenOut}`);
    const snapshot = poolId ? pool.get(poolId) : undefined;
    if (!snapshot) return undefined;
    const ordered = orderedReserves(snapshot, tokenIn, tokenOut);
    if (!ordered) return undefined;
    return getAmountIn(amountOut, ordered[0], ordered[1]);
  };

  const applyHop = (
    pool: Map<string, PoolSnapshot>,
    tokenIn: string,
    tokenOut: string,
    amountIn: bigint,
    amountOut: bigint
  ): boolean => {
    if (amountIn <= 0n || amountOut <= 0n) return false;
    const poolId = poolsByPair.get(`${tokenIn}|${tokenOut}`);
    const snapshot = poolId ? pool.get(poolId) : undefined;
    if (!snapshot) return false;
    if (snapshot.base === tokenIn && snapshot.quote === tokenOut) {
      if (amountOut >= snapshot.quoteReserve) return false;
      snapshot.baseReserve += amountIn;
      snapshot.quoteReserve -= amountOut;
      return true;
    }
    if (snapshot.quote === tokenIn && snapshot.base === tokenOut) {
      if (amountOut >= snapshot.baseReserve) return false;
      snapshot.quoteReserve += amountIn;
      snapshot.baseReserve -= amountOut;
      return true;
    }
    return false;
  };

  const cloneReserves = (): Map<string, PoolSnapshot> => {
    const copy = new Map<string, PoolSnapshot>();
    for (const [id, p] of reserves) copy.set(id, { ...p });
    return copy;
  };

  const commit = (trial: Map<string, PoolSnapshot>): void => {
    reserves.clear();
    for (const [id, p] of trial) reserves.set(id, p);
  };

  /* ------------------------------------------------ frBTC (wrap/unwrap) */

  const projectFrbtc = (
    cell: Cellpack,
    incoming: ProjSheet
  ): ProjSheet | undefined => {
    if (!signer) return undefined;
    if (cell.opcode === FRBTC_WRAP) {
      let sats = 0n;
      for (let i = 0; i < vouts.length; i++) {
        if (scripts[i] === signer) sats += BigInt(vouts[i].value);
      }
      if (sats <= 0n) return undefined;
      const output = cloneSheet(incoming);
      // espo estimates the mint 1:1 with the sats paid to the signer
      addToSheet(output, data.frbtcId, sats);
      return output;
    }
    if (cell.opcode === FRBTC_UNWRAP) {
      const voutIdx = Number(cell.inputs[0] ?? -1n);
      const amount = cell.inputs[1] ?? 0n;
      if (amount <= 0n) return undefined;
      if (!Number.isFinite(voutIdx) || scripts[voutIdx] !== signer) {
        return undefined;
      }
      const output = cloneSheet(incoming);
      if (removeFromSheet(output, data.frbtcId, amount) !== amount) {
        return undefined;
      }
      return output;
    }
    return undefined;
  };

  /* ------------------------------------------------ AMM pool (direct) */

  const projectPoolSwap = (
    poolId: string,
    inputs: bigint[],
    incoming: ProjSheet
  ): ProjSheet | undefined => {
    const snapshot = reserves.get(poolId);
    if (!snapshot) return undefined;
    const amount0Out = inputs[0] ?? 0n;
    const amount1Out = inputs[1] ?? 0n;
    if (amount0Out > 0n && amount1Out > 0n) return undefined;

    const baseIn = incoming.get(snapshot.base) ?? 0n;
    const quoteIn = incoming.get(snapshot.quote) ?? 0n;
    if (baseIn > 0n === quoteIn > 0n) return undefined;

    const trial = cloneReserves();
    let tokenIn: string;
    let amountIn: bigint;
    let tokenOut: string;
    let expectedOut: bigint;
    if (baseIn > 0n) {
      const computed = amountOutForPair(
        snapshot.base,
        snapshot.quote,
        baseIn,
        trial
      );
      if (computed === undefined) return undefined;
      tokenIn = snapshot.base;
      amountIn = baseIn;
      tokenOut = snapshot.quote;
      expectedOut = amount1Out > 0n && amount1Out < computed ? amount1Out : computed;
    } else {
      const computed = amountOutForPair(
        snapshot.quote,
        snapshot.base,
        quoteIn,
        trial
      );
      if (computed === undefined) return undefined;
      tokenIn = snapshot.quote;
      amountIn = quoteIn;
      tokenOut = snapshot.base;
      expectedOut = amount0Out > 0n && amount0Out < computed ? amount0Out : computed;
    }
    if (expectedOut <= 0n) return undefined;
    if (!applyHop(trial, tokenIn, tokenOut, amountIn, expectedOut)) {
      return undefined;
    }

    commit(trial);
    const output = cloneSheet(incoming);
    removeFromSheet(output, tokenIn, amountIn);
    addToSheet(output, tokenOut, expectedOut);
    return output;
  };

  const projectPoolCall = (
    poolId: string,
    cell: Cellpack,
    incoming: ProjSheet
  ): ProjSheet | undefined => {
    if (cell.opcode === POOL_SWAP) {
      return projectPoolSwap(poolId, cell.inputs, incoming);
    }
    if (POOL_PASS_THROUGH.has(cell.opcode)) return cloneSheet(incoming);
    // liquidity ops need the LP supply, which the wallet does not track
    if (
      cell.opcode === POOL_ADD_LIQUIDITY ||
      cell.opcode === POOL_WITHDRAW_AND_BURN
    ) {
      return undefined;
    }
    return undefined;
  };

  /* ------------------------------------------------ AMM factory */

  const projectFactoryExactIn = (
    inputs: bigint[],
    incoming: ProjSheet,
    implicit: boolean
  ): ProjSheet | undefined => {
    const parsed = parsePath(inputs, implicit ? 1 : 2);
    if (!parsed) return undefined;
    let { path } = parsed;
    const { cursor } = parsed;
    let amountIn: bigint;
    if (implicit) {
      // op 29: the input token + amount are whatever single alkane arrived on
      // the protostone; a remaining-hops path gets that id prepended.
      const positive = [...incoming.entries()].filter(([, amt]) => amt > 0n);
      if (positive.length !== 1) return undefined;
      const [inputId, available] = positive[0];
      if (path[0] !== inputId) path = [inputId, ...path];
      if (path.length < 2) return undefined;
      amountIn = available;
    } else {
      const available = incoming.get(path[0]) ?? 0n;
      amountIn = inputs[cursor] ?? 0n;
      if (amountIn <= 0n || available < amountIn) return undefined;
    }
    if (amountIn <= 0n) return undefined;
    const minOut = (implicit ? inputs[cursor] : inputs[cursor + 1]) ?? 0n;

    const trial = cloneReserves();
    let amount = amountIn;
    for (let i = 0; i < path.length - 1; i++) {
      const out = amountOutForPair(path[i], path[i + 1], amount, trial);
      if (out === undefined) return undefined;
      if (!applyHop(trial, path[i], path[i + 1], amount, out)) return undefined;
      amount = out;
    }
    if (amount < minOut) return undefined;

    commit(trial);
    const output = cloneSheet(incoming);
    removeFromSheet(output, path[0], amountIn);
    addToSheet(output, path[path.length - 1], amount);
    return output;
  };

  const projectFactoryExactOut = (
    inputs: bigint[],
    incoming: ProjSheet
  ): ProjSheet | undefined => {
    const parsed = parsePath(inputs, 2);
    if (!parsed) return undefined;
    const { path, cursor } = parsed;
    const desiredOut = inputs[cursor] ?? 0n;
    const amountInMax = inputs[cursor + 1] ?? 0n;
    if (desiredOut <= 0n) return undefined;

    const amounts = new Array<bigint>(path.length).fill(0n);
    amounts[path.length - 1] = desiredOut;
    for (let i = path.length - 2; i >= 0; i--) {
      const needed = amountInForPair(
        path[i],
        path[i + 1],
        amounts[i + 1],
        reserves
      );
      if (needed === undefined) return undefined;
      amounts[i] = needed;
    }
    const amountIn = amounts[0];
    const available = incoming.get(path[0]) ?? 0n;
    if (amountIn <= 0n || amountIn > amountInMax || available < amountIn) {
      return undefined;
    }

    const trial = cloneReserves();
    for (let i = 0; i < path.length - 1; i++) {
      if (!applyHop(trial, path[i], path[i + 1], amounts[i], amounts[i + 1])) {
        return undefined;
      }
    }

    commit(trial);
    const output = cloneSheet(incoming);
    removeFromSheet(output, path[0], amountIn);
    addToSheet(output, path[path.length - 1], desiredOut);
    return output;
  };

  const projectFactory = (
    cell: Cellpack,
    incoming: ProjSheet
  ): ProjSheet | undefined => {
    switch (cell.opcode) {
      case FACTORY_SWAP_EXACT_IN:
        return projectFactoryExactIn(cell.inputs, incoming, false);
      case FACTORY_SWAP_EXACT_IN_IMPLICIT:
        return projectFactoryExactIn(cell.inputs, incoming, true);
      case FACTORY_SWAP_EXACT_OUT:
        return projectFactoryExactOut(cell.inputs, incoming);
      case FACTORY_CREATE_NEW_POOL:
      case FACTORY_ADD_LIQUIDITY:
      case FACTORY_BURN:
        // liquidity/pool creation needs LP supply / sequence state
        return undefined;
      default:
        return FACTORY_PASS_THROUGH.has(cell.opcode)
          ? cloneSheet(incoming)
          : undefined;
    }
  };

  return (cell, incoming) => {
    const target = `${cell.target.block}:${cell.target.tx}`;
    if (target === data.frbtcId) return projectFrbtc(cell, incoming);
    if (reserves.has(target)) return projectPoolCall(target, cell, incoming);
    if (data.factoryId && target === data.factoryId) {
      return projectFactory(cell, incoming);
    }
    return undefined;
  };
}
