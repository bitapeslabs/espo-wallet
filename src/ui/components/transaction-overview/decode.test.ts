/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test";
import * as bitcoin from "bitcoinjs-lib";
import { networks } from "bitcoinjs-lib";
import {
  encipher,
  encodeRunestoneProtostone,
  ProtoStone,
} from "alkanes";
import { ProtoruneRuneId } from "alkanes/lib/protorune/protoruneruneid";
import { u128, u32 } from "@magiceden-oss/runestone-lib/dist/src/integer";
import {
  decodeCellpack,
  decodeTransaction,
  projectOutputAlkanes,
  type AlkaneAmt,
  type Protostone,
} from "./decode";

const NETWORK = networks.regtest;

// A dummy P2WPKH-ish output script (20-byte program) so outputs decode to an
// address and are treated as spendable (non-OP_RETURN).
function p2wpkhScript(seed: number): Buffer {
  const program = Buffer.alloc(20, seed);
  return bitcoin.script.compile([bitcoin.opcodes.OP_0, program]);
}

// Build a raw tx: two inputs, `outputScripts` outputs, then the protostone
// OP_RETURN appended last (matching alkanesjs, which appends it after outputs).
function buildTx(
  outputScripts: Buffer[],
  runestoneScript: Buffer
): bitcoin.Transaction {
  const tx = new bitcoin.Transaction();
  const prevA = Buffer.alloc(32, 0x11);
  const prevB = Buffer.alloc(32, 0x22);
  tx.addInput(prevA, 0);
  tx.addInput(prevB, 3);
  for (const s of outputScripts) tx.addOutput(s, 1000);
  tx.addOutput(runestoneScript, 0);
  return tx;
}

type Edicts = NonNullable<ProtoStone["edicts"]>;

function edict(block: bigint, tx: bigint, amount: bigint, output: number) {
  return {
    id: new ProtoruneRuneId(u128(block), u128(tx)),
    amount: u128(amount),
    output: u32(BigInt(output)),
  };
}

describe("decodeTransaction round-trip", () => {
  test("plain transfer: edicts + pointer, no message", () => {
    // 3 spendable outputs (vout 0,1,2), OP_RETURN becomes vout 3, pointer=3? No:
    // pointer must be a real output; alkanesjs points at a dust output index.
    const outputs = [p2wpkhScript(1), p2wpkhScript(2), p2wpkhScript(3)];
    const edicts: Edicts = [
      edict(2n, 1n, 500n, 0),
      edict(2n, 5n, 0n, 1), // "transfer all" of 2:5 to vout 1
    ];
    const { encodedRunestone } = encodeRunestoneProtostone({
      protostones: [
        ProtoStone.edicts({
          protocolTag: 1n,
          edicts,
        }),
      ],
    });
    const tx = buildTx(outputs, encodedRunestone);
    const decoded = decodeTransaction(tx.toHex(), NETWORK);

    expect(decoded.txid).toBe(tx.getId());
    expect(decoded.vins.length).toBe(2);
    expect(decoded.vins[0].vout).toBe(0);
    expect(decoded.vins[1].vout).toBe(3);
    expect(decoded.vins[0].isCoinbase).toBe(false);
    // 3 spendable + 1 OP_RETURN
    expect(decoded.vouts.length).toBe(4);
    expect(decoded.vouts[3].isOpReturn).toBe(true);
    expect(decoded.vouts[0].isOpReturn).toBe(false);
    expect(decoded.vouts[0].address).toBeDefined();

    expect(decoded.protostones.length).toBe(1);
    const ps = decoded.protostones[0];
    expect(ps.protocolTag).toBe(1n);
    expect(ps.message).toBeUndefined();
    expect(ps.edicts.length).toBe(2);
    expect(ps.edicts[0]).toEqual({ block: 2n, tx: 1n, amount: 500n, output: 0 });
    expect(ps.edicts[1]).toEqual({ block: 2n, tx: 5n, amount: 0n, output: 1 });
  });

  test("message / cellpack case (with pointer + refund + edict)", () => {
    const outputs = [p2wpkhScript(1), p2wpkhScript(2)];
    // cellpack: target 4:0, opcode 77, inputs [1, 999]
    const callData = [4n, 0n, 77n, 1n, 999n];
    const edicts: Edicts = [edict(2n, 1n, 123n, 0)];
    const { encodedRunestone } = encodeRunestoneProtostone({
      protostones: [
        ProtoStone.message({
          protocolTag: 1n,
          pointer: 0,
          refundPointer: 1,
          calldata: encipher(callData),
          edicts,
        }),
      ],
    });
    const tx = buildTx(outputs, encodedRunestone);
    const decoded = decodeTransaction(tx.toHex(), NETWORK);

    expect(decoded.protostones.length).toBe(1);
    const ps = decoded.protostones[0];
    expect(ps.protocolTag).toBe(1n);
    expect(ps.pointer).toBe(0);
    expect(ps.refundPointer).toBe(1);
    expect(ps.edicts).toEqual([{ block: 2n, tx: 1n, amount: 123n, output: 0 }]);

    expect(ps.message).toBeDefined();
    const cp = decodeCellpack(ps.message!);
    expect(cp).toBeDefined();
    expect(cp!.target).toEqual({ block: 4n, tx: 0n });
    expect(cp!.opcode).toBe(77n);
    expect(cp!.inputs).toEqual([1n, 999n]);
  });

  test("plain BTC tx with no OP_RETURN -> protostones: []", () => {
    const tx = new bitcoin.Transaction();
    tx.addInput(Buffer.alloc(32, 0x11), 0);
    tx.addOutput(p2wpkhScript(9), 5000);
    const decoded = decodeTransaction(tx.toHex(), NETWORK);
    expect(decoded.protostones).toEqual([]);
    expect(decoded.vouts[0].isOpReturn).toBe(false);
  });
});

/* ------------------------------------------------------- projection tests */

const A = "2:1"; // alkane id used in projection tests

function amt(id: string, amount: bigint): AlkaneAmt {
  return { id, amount };
}

// Minimal protostone helper for projection unit tests.
function proto(
  edicts: Protostone["edicts"],
  pointer?: number
): Protostone {
  return { protocolTag: 1n, edicts, pointer };
}

describe("projectOutputAlkanes", () => {
  test("(a) single edict moves a fixed amount to vout 0, leftover to pointer", () => {
    // voutCount = 3 (vout 0,1 spendable, vout 2 OP_RETURN). pointer -> vout 1.
    const spendable = [0, 1];
    const res = projectOutputAlkanes(
      [amt(A, 1000n)],
      [proto([{ block: 2n, tx: 1n, amount: 300n, output: 0 }], 1)],
      3,
      spendable
    );
    expect(res.get(0)).toEqual([amt(A, 300n)]);
    expect(res.get(1)).toEqual([amt(A, 700n)]); // leftover to pointer
    expect(res.has(2)).toBe(false);
  });

  test("(b) amount==0 edict transfers ALL to the target vout", () => {
    const spendable = [0, 1];
    const res = projectOutputAlkanes(
      [amt(A, 4200n)],
      [proto([{ block: 2n, tx: 1n, amount: 0n, output: 1 }])],
      3,
      spendable
    );
    // everything moved to vout 1; nothing left over
    expect(res.get(1)).toEqual([amt(A, 4200n)]);
    expect(res.has(0)).toBe(false);
  });

  test("(c) no edicts -> leftover to first spendable vout (no pointer)", () => {
    const spendable = [1, 2];
    const res = projectOutputAlkanes([amt(A, 55n)], [proto([])], 3, spendable);
    expect(res.get(1)).toEqual([amt(A, 55n)]);
    expect(res.has(0)).toBe(false);
    expect(res.has(2)).toBe(false);
  });

  test("(d) pointer routing sends leftovers to the pointer vout", () => {
    const spendable = [0, 1, 2];
    const res = projectOutputAlkanes(
      [amt(A, 1000n)],
      [proto([], 2)], // no edicts, pointer -> vout 2
      4,
      spendable
    );
    expect(res.get(2)).toEqual([amt(A, 1000n)]);
    expect(res.has(0)).toBe(false);
    expect(res.has(1)).toBe(false);
  });

  test("multicast (output === voutCount) splits ALL evenly with remainder", () => {
    const spendable = [0, 1, 2];
    const res = projectOutputAlkanes(
      [amt(A, 10n)],
      [proto([{ block: 2n, tx: 1n, amount: 0n, output: 3 }])], // 3 === voutCount
      3,
      spendable
    );
    // 10 / 3 = 3 each, remainder 1 -> first gets +1: [4,3,3]
    expect(res.get(0)).toEqual([amt(A, 4n)]);
    expect(res.get(1)).toEqual([amt(A, 3n)]);
    expect(res.get(2)).toEqual([amt(A, 3n)]);
  });

  test("no protostones -> empty projection", () => {
    const res = projectOutputAlkanes([amt(A, 1000n)], [], 2, [0, 1]);
    expect(res.size).toBe(0);
  });
});
