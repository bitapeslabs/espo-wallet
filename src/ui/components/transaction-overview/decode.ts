import {
  decodeCellpack,
  decodeLEB128List,
  stripTrailingZeros,
  type Cellpack,
} from "@/shared/utils/cellpack";

export { decodeCellpack, type Cellpack };

import * as bitcoin from "bitcoinjs-lib";
import type { Network } from "bitcoinjs-lib";

/*
 * Alkanes / protorune protostone decoder + per-output balance projection.
 *
 * This is a browser-side (pre-broadcast, NOTRACE) port of espo's plain-transfer
 * edict engine. It reverses the wire format produced by alkanesjs's
 * `encodeRunestoneProtostone` (the same call the SDK uses to build sends) and
 * projects how alkane balances land on each output using only the edicts /
 * pointer of the protostones (no live traces are available before broadcast).
 *
 * Wire format (two nested layers of 15-byte "u128 packing"):
 *   OP_RETURN OP_PUSHNUM_13 <pushdata...>
 *     -> concat pushdata = LEB128 stream of the runestone message
 *     -> collect all values under runestone tag 16383 ("Protocol") = u128[]
 *        (level-0 protocol payload)
 *     -> join_to_bytes(protocol u128[]) : 15 little-endian bytes per value
 *     -> LEB128 decode  = the protostone integer stream
 *     -> per protostone: [protocolTag, length, ...length field items]
 *          fields are tag/value pairs (POINTER=91, REFUND=93, MESSAGE=81)
 *          until BODY=0, after which the remainder are edict quads
 *        MESSAGE values are themselves a 15-byte packing of the cellpack bytes
 *          -> join_to_bytes(message u128[]) = the cellpack (LEB128 u128 list)
 */

/* ------------------------------------------------------------------ types */

export interface TxVin {
  txid: string;
  vout: number;
  isCoinbase: boolean;
}
export interface TxVout {
  address?: string;
  value: number;
  isOpReturn: boolean;
  scriptHex: string;
}
export interface Edict {
  block: bigint;
  tx: bigint;
  amount: bigint;
  output: number;
}
export interface Protostone {
  protocolTag: bigint;
  edicts: Edict[];
  pointer?: number;
  refundPointer?: number;
  message?: Uint8Array; // undefined/empty when no contract call
}
export interface DecodedTx {
  txid: string;
  vins: TxVin[];
  vouts: TxVout[];
  protostones: Protostone[]; // [] when the tx has no runestone/protostone
}
export interface AlkaneAmt {
  id: string; // "block:tx"
  amount: bigint;
}

/* -------------------------------------------------------------- constants */

const OP_RETURN = 0x6a;
const OP_PUSHNUM_13 = 0x5d; // runestone magic number (OP_13)

// Runestone message field tag under which protostone payloads are stored.
const RUNESTONE_PROTOCOL_TAG = 16383n;
const RUNESTONE_BODY_TAG = 0n;

// Protostone field tags (protorune "prototags").
const PROTO_TAG_BODY = 0n;
const PROTO_TAG_MESSAGE = 81n;
const PROTO_TAG_POINTER = 91n;
const PROTO_TAG_REFUND = 93n;

const U15_MASK = (1n << 120n) - 1n; // low 15 bytes

/* --------------------------------------------------------- LEB128 varints */

/**
 * Decode a byte buffer into a list of u128 integers, matching the runestone
 * LEB128 reader used by the alkanes encoder (`bytes.decipher` /
 * `Runestone::integers`): stop as soon as a full varint can't be read.
 */


/**
 * Inverse of `unpack`: turn a list of u128 values into a byte buffer, writing
 * exactly 15 little-endian bytes per value (the alkanes `pack` /
 * `join_to_bytes` / `snap_to_15_bytes` behaviour). The 16th byte is never
 * written, so runes never treats the payload as a cenotaph.
 */
function joinToBytes(values: bigint[]): Uint8Array {
  const out = new Uint8Array(values.length * 15);
  for (let vi = 0; vi < values.length; vi++) {
    let v = values[vi] & U15_MASK;
    const base = vi * 15;
    for (let b = 0; b < 15; b++) {
      out[base + b] = Number(v & 0xffn);
      v >>= 8n;
    }
  }
  return out;
}



/* ----------------------------------------------------- protostone parsing */

/**
 * Reproduce protorune-support `to_fields`: read (tag, value) pairs into a map
 * keyed by tag; once BODY (tag 0) appears, its value plus every remaining
 * value become the body list.
 */
function toFields(values: bigint[]): Map<bigint, bigint[]> {
  const map = new Map<bigint, bigint[]>();
  let i = 0;
  while (i + 1 < values.length) {
    const key = values[i];
    const value = values[i + 1];
    i += 2;
    if (key === PROTO_TAG_BODY) {
      const list = [value, ...values.slice(i)];
      map.set(key, list);
      break;
    }
    const existing = map.get(key);
    if (existing) existing.push(value);
    else map.set(key, [value]);
  }
  return map;
}

/** Reproduce `protostone_edicts_from_integers`: quads with running id deltas. */
function edictsFromBody(body: bigint[]): Edict[] {
  if (body.length % 4 !== 0) return []; // "edict values did not appear in sets of four"
  const result: Edict[] = [];
  let prevBlock = 0n;
  let prevTx = 0n;
  for (let i = 0; i < body.length; i += 4) {
    const blockDelta = body[i];
    const txDelta = body[i + 1];
    const amount = body[i + 2];
    const output = body[i + 3];
    const block = prevBlock + blockDelta;
    const tx = blockDelta === 0n ? prevTx + txDelta : txDelta;
    result.push({ block, tx, amount, output: Number(output) });
    prevBlock = block;
    prevTx = tx;
  }
  return result;
}

/**
 * Decode the runestone tag-16383 protocol payload into protostones.
 * Reproduces protorune-support `Protostone::decipher`.
 */
function decodeProtostones(protocolValues: bigint[]): Protostone[] {
  if (protocolValues.length === 0) return [];
  const ints = decodeLEB128List(joinToBytes(protocolValues));
  const result: Protostone[] = [];
  let i = 0;
  while (i < ints.length) {
    const protocolTag = ints[i++];
    // protocol tag 0 marks postfix zero padding from the last u128.
    if (protocolTag === 0n) break;
    if (i >= ints.length) break;
    const length = Number(ints[i++]);
    if (length < 0 || i + length > ints.length) break;
    const fieldWindow = ints.slice(i, i + length);
    i += length;

    const fields = toFields(fieldWindow);

    const pointerVals = fields.get(PROTO_TAG_POINTER);
    const refundVals = fields.get(PROTO_TAG_REFUND);
    const messageVals = fields.get(PROTO_TAG_MESSAGE);
    const body = fields.get(PROTO_TAG_BODY);

    let message: Uint8Array | undefined;
    if (messageVals && messageVals.length) {
      const bytes = stripTrailingZeros(joinToBytes(messageVals));
      if (bytes.length) message = bytes;
    }

    result.push({
      protocolTag,
      edicts: body ? edictsFromBody(body) : [],
      pointer: pointerVals && pointerVals.length ? Number(pointerVals[0]) : undefined,
      refundPointer: refundVals && refundVals.length ? Number(refundVals[0]) : undefined,
      message,
    });
  }
  return result;
}

/* ---------------------------------------------------- OP_RETURN extraction */

/** Concatenate the pushdata of the first `OP_RETURN OP_PUSHNUM_13 ...` output. */
function extractRunestonePayload(tx: bitcoin.Transaction): Uint8Array | undefined {
  for (const out of tx.outs) {
    const script = out.script;
    if (script.length < 2 || script[0] !== OP_RETURN || script[1] !== OP_PUSHNUM_13) {
      continue;
    }
    let decompiled: Array<number | Buffer> | null;
    try {
      decompiled = bitcoin.script.decompile(script);
    } catch {
      continue;
    }
    if (!decompiled || decompiled.length < 2) continue;
    const chunks: Buffer[] = [];
    for (let k = 2; k < decompiled.length; k++) {
      const el = decompiled[k];
      if (Buffer.isBuffer(el)) chunks.push(el);
    }
    return Buffer.concat(chunks);
  }
  return undefined;
}

/** Collect all values stored under the runestone Protocol tag (16383). */
function collectProtocolValues(payload: Uint8Array): bigint[] {
  const ints = decodeLEB128List(payload);
  const protocol: bigint[] = [];
  let i = 0;
  while (i + 1 < ints.length) {
    const tag = ints[i];
    // The runes BODY tag (0) is followed by edict quads, not tag/value pairs.
    if (tag === RUNESTONE_BODY_TAG) break;
    const value = ints[i + 1];
    if (tag === RUNESTONE_PROTOCOL_TAG) protocol.push(value);
    i += 2;
  }
  return protocol;
}

/* ------------------------------------------------------------- public API */

/** Decode inputs, outputs, OP_RETURN + protostones from a raw tx hex. */
export function decodeTransaction(hex: string, network: Network): DecodedTx {
  const tx = bitcoin.Transaction.fromHex(hex);

  const vins: TxVin[] = tx.ins.map((input) => {
    const isCoinbase =
      input.index === 0xffffffff && input.hash.every((b) => b === 0);
    return {
      txid: Buffer.from(input.hash).reverse().toString("hex"),
      vout: input.index,
      isCoinbase,
    };
  });

  const vouts: TxVout[] = tx.outs.map((out) => {
    const script = out.script;
    const isOpReturn = script.length > 0 && script[0] === OP_RETURN;
    let address: string | undefined;
    if (!isOpReturn) {
      try {
        address = bitcoin.address.fromOutputScript(script, network);
      } catch {
        address = undefined;
      }
    }
    return {
      address,
      value: out.value,
      isOpReturn,
      scriptHex: Buffer.from(script).toString("hex"),
    };
  });

  let protostones: Protostone[] = [];
  const payload = extractRunestonePayload(tx);
  if (payload && payload.length) {
    const protocolValues = collectProtocolValues(payload);
    protostones = decodeProtostones(protocolValues);
  }

  return { txid: tx.getId(), vins, vouts, protostones };
}

/** Decode a protostone message (cellpack). Returns undefined if not valid. */


/* --------------------------------------------------- balance projection */

type Sheet = Map<string, bigint>; // "block:tx" -> amount

function idOf(block: bigint, tx: bigint): string {
  return `${block}:${tx}`;
}

/**
 * Project per-output alkane balances, porting espo's plain-transfer edict
 * engine (the NOTRACE path). See the module-level interface docs.
 */
export function projectOutputAlkanes(
  inputAlkanes: AlkaneAmt[],
  protostones: Protostone[],
  voutCount: number,
  spendableVouts: number[],
  /**
   * Optional contract model (espo's mempool projection, ported for frBTC +
   * the AMM): transforms a message protostone's incoming sheet into its
   * predicted result; undefined = fall back to plain pass-through.
   */
  contractProjector?: (
    cell: Cellpack,
    incoming: Sheet
  ) => Sheet | undefined
): Map<number, AlkaneAmt[]> {
  const multicastIndex = voutCount;
  const spendableSet = new Set(spendableVouts);
  // accumulated per-vout balances
  const out = new Map<number, Sheet>();
  // alkanes routed INTO each protostone's shadow vout (the runtime convention
  // is shadow(i) = voutCount + 1 + i); protostone i consumes its bucket when
  // its own turn comes.
  const incomingShadow: Sheet[] = protostones.map(() => new Map());

  const deposit = (vout: number, id: string, amount: bigint): void => {
    if (amount <= 0n) return;
    let sheet = out.get(vout);
    if (!sheet) {
      sheet = new Map();
      out.set(vout, sheet);
    }
    sheet.set(id, (sheet.get(id) ?? 0n) + amount);
  };

  // Route a whole delta (id -> amount) to a target output, mirroring espo's
  // `route_delta`: multicast splits evenly, a spendable vout receives it all,
  // anything else burns.
  const routeDelta = (target: number, delta: Sheet): void => {
    if (delta.size === 0) return;
    if (target === multicastIndex) {
      if (spendableVouts.length === 0) return;
      const m = BigInt(spendableVouts.length);
      for (const [id, total] of delta) {
        if (total <= 0n) continue;
        const per = total / m;
        const rem = Number(total % m);
        for (let i = 0; i < spendableVouts.length; i++) {
          const amt = per + (i < rem ? 1n : 0n);
          if (amt <= 0n) continue;
          deposit(spendableVouts[i], id, amt);
        }
      }
      return;
    }
    if (target < voutCount && spendableSet.has(target)) {
      for (const [id, amt] of delta) deposit(target, id, amt);
      return;
    }
    // a shadow vout feeds the corresponding protostone's incoming sheet
    const shadowIdx = target - voutCount - 1;
    if (shadowIdx >= 0 && shadowIdx < incomingShadow.length) {
      const bucket = incomingShadow[shadowIdx];
      for (const [id, amt] of delta) {
        if (amt > 0n) bucket.set(id, (bucket.get(id) ?? 0n) + amt);
      }
      return;
    }
    // else burn by omission
  };

  const applyEdict = (sheet: Sheet, ed: Edict): void => {
    // guard: block 0 with a non-zero tx is invalid
    if (ed.block === 0n && ed.tx > 0n) return;
    const id = idOf(ed.block, ed.tx);
    const outIdx = ed.output;

    if (outIdx === multicastIndex) {
      if (spendableVouts.length === 0) return;
      const have = sheet.get(id) ?? 0n;
      if (have <= 0n) return;

      if (ed.amount === 0n) {
        // even split of ALL available
        sheet.delete(id);
        const delta: Sheet = new Map([[id, have]]);
        routeDelta(multicastIndex, delta);
      } else {
        // amount > 0 -> per-vout cap, walk spendable vouts using ALL available
        let remaining = have;
        let used = 0n;
        for (const v of spendableVouts) {
          if (remaining <= 0n) break;
          const give = remaining < ed.amount ? remaining : ed.amount;
          if (give <= 0n) break;
          deposit(v, id, give);
          remaining -= give;
          used += give;
        }
        const newHave = have - used;
        if (newHave <= 0n) sheet.delete(id);
        else sheet.set(id, newHave);
      }
      return;
    }

    // normal (non-multicast) target
    const have = sheet.get(id) ?? 0n;
    const need = ed.amount === 0n ? have : ed.amount < have ? ed.amount : have;
    if (need <= 0n) return;
    const newHave = have - need;
    if (newHave <= 0n) sheet.delete(id);
    else sheet.set(id, newHave);
    routeDelta(outIdx, new Map([[id, need]]));
  };

  protostones.forEach((ps, i) => {
    let sheet: Sheet = new Map();

    // Seed VIN balances into protostone 0 only.
    if (i === 0) {
      for (const a of inputAlkanes) {
        if (a.amount <= 0n) continue;
        sheet.set(a.id, (sheet.get(a.id) ?? 0n) + a.amount);
      }
    }
    // ...plus whatever earlier protostones' edicts sent to this shadow vout.
    for (const [id, amt] of incomingShadow[i]) {
      sheet.set(id, (sheet.get(id) ?? 0n) + amt);
    }

    // A contract call transforms its incoming sheet (espo's NOTRACE hook):
    // e.g. a wrap mints frBTC onto it, a swap exchanges the attached token.
    if (contractProjector && ps.message && ps.message.length) {
      const cell = decodeCellpack(ps.message);
      if (cell) {
        const projected = contractProjector(cell, sheet);
        if (projected) sheet = projected;
      }
    }

    for (const ed of ps.edicts) applyEdict(sheet, ed);

    // leftovers after edicts
    if (sheet.size > 0) {
      if (ps.pointer !== undefined) {
        routeDelta(ps.pointer, sheet);
      } else if (spendableVouts.length > 0) {
        const first = spendableVouts[0];
        for (const [id, amt] of sheet) deposit(first, id, amt);
      }
      // else burn by omission
    }
  });

  // Materialize into the public shape, sorted by (block, tx) for determinism.
  const result = new Map<number, AlkaneAmt[]>();
  for (const [vout, sheet] of out) {
    const entries: AlkaneAmt[] = [];
    for (const [id, amount] of sheet) {
      if (amount > 0n) entries.push({ id, amount });
    }
    entries.sort((a, b) => {
      const [ab, at] = a.id.split(":").map((s) => BigInt(s));
      const [bb, bt] = b.id.split(":").map((s) => BigInt(s));
      if (ab !== bb) return ab < bb ? -1 : 1;
      if (at !== bt) return at < bt ? -1 : 1;
      return 0;
    });
    if (entries.length) result.set(vout, entries);
  }
  return result;
}
