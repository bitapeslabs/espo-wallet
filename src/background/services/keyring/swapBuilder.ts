/*
  ─────────────────  SWAP / WRAP / UNWRAP COMPOSITION (alkanesjs v1.3)  ────────

  The old SDK shipped `buildSwapTransactions`, one entry point that produced
  every package shape. The v1.3 SDK removed it in favour of composing the same
  transactions from `account.tx()` chains + shipped ABIs, so the five scenarios
  now live here:

    BTC   -> token   CPFP package: parent wrap (BTC -> frBTC), child swap
    token -> BTC     CPFP package: parent swap (token -> frBTC), child unwrap
    token -> token   ONE tx (swap)
    BTC   -> frBTC   ONE tx (wrap)
    frBTC -> BTC     ONE tx (unwrap)

  Wire shape per tx is the builder's fixed layout: a leading TRANSFER stone
  (its edicts are the `.transfer()`s — the old "shifter") and one stone per
  `.call()`. `.transfer(token, amount, 1)` aims the edict at shadow vout 1,
  i.e. the first call, which is exactly the old shifter -> message pattern;
  leftovers and siblings return to the home output automatically.

  Real output layout (deterministic, from the builder): output 0 is the
  alkanes home/dust output, then one output per DISTINCT destination address
  in first-appearance order (alkane handoffs first, then sat payments), then
  change. An alkane handoff aimed at a shadow vout still buys an output at
  the sender's own asset address. `unwrap` needs that arithmetic: its first
  cellpack argument is the REAL vout of the signer anchor output.

  Fee model change vs the old SDK: `buildSwapTransactions` priced CPFP parents
  at the 0.2 sat/vB relay floor with the child paying the deficit. The wallet
  broadcasts each tx individually through espo's `broadcast_transaction` (not
  `submit_package`), and a sub-1 sat/vB parent is not individually relayable
  on default-policy nodes, so BOTH package txs are now built at the requested
  feeRate. `packageFeeRate` therefore lands at ~feeRate.
*/

import { Psbt, Transaction } from "bitcoinjs-lib";
import {
  Account,
  AlkaneId,
  Contract,
  buildChain,
  type AlkaneTx,
  type BuiltTx,
  type Provider,
} from "alkanesjs";
import { FrBTCAbi, OylAMMAbi } from "alkanesjs/abis";
import {
  applyFrbtcPremium,
  DEFAULT_FRBTC_PREMIUM,
  getFrbtcSignerAddress,
} from "alkanesjs/utils/frbtc";

/** Dust an output must carry to be relayable / to anchor the signer. */
const DUST = 546n;
/** The frBTC contract refuses smaller burns (old SDK's FRBTC_MIN_UNWRAP). */
const FRBTC_MIN_UNWRAP = 546n;
/** A wrap below dust would produce an unrelayable signer output. */
const MIN_WRAP_SATS = 546n;

export type SwapTxLabel = "wrap" | "swap" | "unwrap";
export type SwapMode = "exactIn" | "exactOut";

export interface SwapTx {
  hex: string;
  txid: string;
  label: SwapTxLabel;
  vsize: number;
  fee: number;
}

export interface SwapPackageResult {
  /** Broadcast in order. A 2-entry list is a CPFP package (parent first). */
  txs: SwapTx[];
  /** Only set for a package: the rate the pair achieves together. */
  packageFeeRate?: number;
}

export interface SwapBuildParams {
  /**
   * The signing SDK account (external-signer backed by the keyring). MUST be
   * constructed with `{ feeRate }` matching `feeRate` below: package builds go
   * through `buildChain`, which reads the rate off the account.
   */
  account: Account;
  provider: Provider;
  /** "btc" or "block:tx". */
  fromId: string;
  toId: string;
  /** exactIn: the amount spent. exactOut: the MAXIMUM spendable (ceiling). */
  amountIn: bigint;
  /** exactIn: the slippage floor. exactOut: the EXACT output requested. */
  minAmountOut: bigint;
  feeRate: number;
  mode: SwapMode;
  /** ABSOLUTE block height; 0 means no deadline. */
  deadline: bigint;
  /** The Oyl AMM factory/router id, "block:tx". */
  factoryId: string;
  /** The frBTC synth id, "block:tx". */
  frbtcId: string;
  /**
   * FULL AMM-leg token path ("block:tx", BTC endpoints already mapped to
   * frBTC): effective sell token first, effective buy token last. Defaults to
   * the direct pair.
   */
  path?: string[];
}

/** vsize + fee of a built tx (fee = input sum - output sum, off the PSBT). */
function txFacts(built: BuiltTx): { vsize: number; fee: number } {
  const psbt = Psbt.fromBase64(built.psbtBase64);
  let inSum = 0;
  psbt.data.inputs.forEach((input, i) => {
    if (input.witnessUtxo) {
      inSum += input.witnessUtxo.value;
    } else if (input.nonWitnessUtxo) {
      const prev = Transaction.fromBuffer(input.nonWitnessUtxo);
      inSum += prev.outs[psbt.txInputs[i].index].value;
    }
  });
  const outSum = psbt.txOutputs.reduce((sum, out) => sum + out.value, 0);
  return { vsize: built.transaction.virtualSize(), fee: inSum - outSum };
}

function asSwapTx(built: BuiltTx, label: SwapTxLabel): SwapTx {
  const { vsize, fee } = txFacts(built);
  return { hex: built.hex, txid: built.txid, label, vsize, fee };
}

const idOf = (id: string) => AlkaneId.fromString(id);

export async function buildSwapPackageTxs(
  p: SwapBuildParams
): Promise<SwapPackageResult> {
  const fromIsBtc = p.fromId === "btc";
  const toIsBtc = p.toId === "btc";
  const fromIsFrbtc = p.fromId === p.frbtcId;
  const toIsFrbtc = p.toId === p.frbtcId;

  if (p.amountIn <= 0n) throw new Error("amountIn must be positive");
  if (fromIsBtc && toIsBtc) throw new Error("BTC to BTC is not a swap");
  if (!fromIsBtc && !toIsBtc && p.fromId === p.toId)
    throw new Error("The two sides of a swap must differ");
  if (p.mode === "exactOut" && p.minAmountOut <= 0n)
    throw new Error(
      "An exact-output swap needs a positive minAmountOut (it IS the requested output)"
    );

  const frbtcAlkaneId = idOf(p.frbtcId);
  const frbtc = new Contract(FrBTCAbi, frbtcAlkaneId, p.provider);
  const factory = new Contract(OylAMMAbi, idOf(p.factoryId), p.provider);

  // The live signer address (espo subfrost.get_signer): wraps pay BTC to it,
  // unwraps anchor a dust output on it. bxrs responses carry `.unwrap()`, so
  // the `alkanesjs/boxed` entry isn't needed (its ESM bundle also lacks static
  // named re-exports of bxrs, which breaks the vite build).
  const needsSigner = fromIsBtc || toIsBtc;
  const signerAddress = needsSigner
    ? (await getFrbtcSignerAddress(p.provider, p.provider.network)).unwrap()
    : "";

  /*
    A wrap: pay the sats to the signer script and follow with a bare wrap()
    cellpack. The contract takes no arguments — it derives the minted amount by
    summing every output paying the signer script, so the BTC transfer IS the
    argument. Minted frBTC lands on the home output (output 0).
  */
  const wrapTx = (sats: bigint): AlkaneTx => {
    if (sats < MIN_WRAP_SATS)
      throw new Error(`A wrap must move at least ${MIN_WRAP_SATS} sats`);
    return p.account.tx().transfer("sats", sats, signerAddress).call(frbtc, "wrap");
  };

  /*
    An unwrap. Three contract rules shape it:
      1. the unwrap message may carry NO edicts — satisfied by the builder's
         shape: the leading transfer stone carries the edict (frBTC into
         shadow vout 1), the call stone carries none;
      2. `vout` must index a REAL output paying the signer script, distinct
         from the message's pointer (the home output, 0);
      3. the BTC is paid out on the pointer output; excess attached frBTC
         refunds there too.

    Real-output arithmetic: home = 0; the frBTC handoff (aimed at shadow 1)
    still buys an output at OUR asset address = 1; the sat payment to the
    signer = 2. Hence vout: 2n.
  */
  const unwrapTx = (attach: bigint, request: bigint): AlkaneTx => {
    if (request < FRBTC_MIN_UNWRAP)
      throw new Error(
        `An unwrap must burn at least ${FRBTC_MIN_UNWRAP} sats of frBTC`
      );
    if (attach < request)
      throw new Error("An unwrap cannot request more frBTC than it attaches");
    if (p.account.assetAddress() === signerAddress)
      throw new Error("Signer address collides with the wallet's own address");
    return p.account
      .tx()
      .transfer(frbtcAlkaneId, attach, 1)
      .transfer("sats", DUST, signerAddress)
      .call(frbtc, "unwrap", { vout: 2n, amount_requested: request });
  };

  /*
    An AMM swap. `.transfer(sell, amount, 1)` is the old "shifter": exactly
    `sellAmount` rides into the router call, siblings and leftovers go home.

      exactIn + explicit — opcode 13, full path, amount_in in calldata.
      exactIn + implicit — opcode 29, REMAINING hops only (the contract
        prepends the incoming token), input = whatever the edict attached.
        Used for the wrap->swap child, whose input is the parent's mint and
        depends on the premium at execution time.
      exactOut           — opcode 14, full path; `sellAmount` becomes the
        amount_in_max ceiling and the unconsumed remainder returns home.
  */
  const swapTx = (
    sellId: string,
    sellAmount: bigint,
    buyId: string,
    implicitInput = false
  ): AlkaneTx => {
    if (sellAmount <= 0n) throw new Error("A swap must sell a positive amount");
    const fullPath = (
      p.path && p.path.length >= 2 ? p.path : [sellId, buyId]
    ).map(idOf);
    if (
      fullPath[0].toString() !== sellId ||
      fullPath[fullPath.length - 1].toString() !== buyId
    ) {
      throw new Error(
        "The swap path must start at the sell token and end at the buy token"
      );
    }

    const tx = p.account.tx().transfer(idOf(sellId), sellAmount, 1);
    if (p.mode === "exactOut") {
      return tx.call(factory, "swapTokensForExactTokens", {
        path: fullPath,
        amount_out: p.minAmountOut,
        amount_in_max: sellAmount,
        deadline: p.deadline,
      });
    }
    if (implicitInput) {
      return tx.call(factory, "swapExactTokensForTokensImplicit", {
        path: fullPath.slice(1),
        amount_out_min: p.minAmountOut,
        deadline: p.deadline,
      });
    }
    return tx.call(factory, "swapExactTokensForTokens", {
      path: fullPath,
      amount_in: sellAmount,
      amount_out_min: p.minAmountOut,
      deadline: p.deadline,
    });
  };

  const single = async (tx: AlkaneTx, label: SwapTxLabel) => ({
    txs: [asSwapTx(await tx.build({ feeRate: p.feeRate }), label)],
  });

  /*───────────── BTC -> frBTC: a bare wrap ─────────────*/
  if (fromIsBtc && toIsFrbtc) return single(wrapTx(p.amountIn), "wrap");

  /*───────────── frBTC -> BTC: a bare unwrap ─────────────*/
  if (fromIsFrbtc && toIsBtc)
    return single(unwrapTx(p.amountIn, p.amountIn), "unwrap");

  /*───────────── token -> token: one swap ─────────────*/
  if (!fromIsBtc && !toIsBtc)
    return single(swapTx(p.fromId, p.amountIn, p.toId), "swap");

  /*
    Package shapes, built through `buildChain` — the same machinery behind the
    SDK's sendPackage/simulateBlock. It threads ONE coin-selection context
    through both builds so the child never re-selects utxos the parent already
    consumed (separately-built txs double-spend each other's inputs, and the
    node rejects the child). The child spends the parent's home output, whose
    contents (the mint / the bought frBTC) only execution knows — the builder
    marks it blind and stands its alkane checks down. buildChain takes no
    per-build options, so the feeRate must ride on the Account itself.
  */
  const pkg = async (
    parent: AlkaneTx,
    parentLabel: SwapTxLabel,
    child: AlkaneTx,
    childLabel: SwapTxLabel
  ): Promise<SwapPackageResult> => {
    const [parentBuilt, childBuilt] = await buildChain(p.provider, [
      parent,
      child,
    ]);
    const txs = [
      asSwapTx(parentBuilt, parentLabel),
      asSwapTx(childBuilt, childLabel),
    ];
    const totalVsize = txs[0].vsize + txs[1].vsize;
    return {
      txs,
      packageFeeRate:
        totalVsize > 0 ? (txs[0].fee + txs[1].fee) / totalVsize : undefined,
    };
  };

  /*───────────── BTC -> token: wrap, then swap ─────────────*/
  if (fromIsBtc) {
    // `amountIn` is what the parent wraps in BOTH modes: under exactOut the
    // caller already grossed the sats up through the premium so the mint
    // clears the swap's amount_in_max; the unconsumed remainder returns as
    // frBTC rather than BTC.
    const premium = await frbtc
      .getPremium()
      .unwrap()
      .catch(() => DEFAULT_FRBTC_PREMIUM);
    const minted = applyFrbtcPremium(p.amountIn, premium as bigint);
    if (minted <= 0n)
      throw new Error("The wrap premium consumes the whole amount; wrap more BTC");

    const parent = wrapTx(p.amountIn);
    const child = p.account.tx().spending(parent);
    // Rebuild the swap chain on the spending() tx (swapTx starts its own).
    child.transfer(frbtcAlkaneId, minted, 1);
    const fullPath = (
      p.path && p.path.length >= 2 ? p.path : [p.frbtcId, p.toId]
    ).map(idOf);
    if (p.mode === "exactOut") {
      child.call(factory, "swapTokensForExactTokens", {
        path: fullPath,
        amount_out: p.minAmountOut,
        amount_in_max: minted,
        deadline: p.deadline,
      });
    } else {
      // The mint's exact size depends on the premium at execution time, so
      // the input amount must come from the attached parcel (opcode 29,
      // remaining hops only).
      child.call(factory, "swapExactTokensForTokensImplicit", {
        path: fullPath.slice(1),
        amount_out_min: p.minAmountOut,
        deadline: p.deadline,
      });
    }
    return pkg(parent, "wrap", child, "swap");
  }

  /*───────────── token -> BTC: swap, then unwrap ─────────────*/
  if (p.minAmountOut < FRBTC_MIN_UNWRAP)
    throw new Error(
      `An unwrap must burn at least ${FRBTC_MIN_UNWRAP} sats; raise minAmountOut`
    );

  // exactIn: the parent's frBTC output is only bounded BELOW by minAmountOut
  // (the AMM prices at execution), so the child burns exactly that guaranteed
  // floor and any surplus frBTC stays in the wallet rather than risking a
  // revert on an over-request. exactOut: the parent delivers minAmountOut
  // precisely, so the same number is the whole output.
  const parent = swapTx(p.fromId, p.amountIn, p.frbtcId);
  const child = p.account
    .tx()
    .spending(parent)
    .transfer(frbtcAlkaneId, p.minAmountOut, 1)
    .transfer("sats", DUST, signerAddress)
    .call(frbtc, "unwrap", { vout: 2n, amount_requested: p.minAmountOut });
  return pkg(parent, "swap", child, "unwrap");
}
