import { FC, ReactNode, useMemo, useState } from "react";
import { TailSpin } from "react-loading-icons";
import type { Network } from "bitcoinjs-lib";
import s from "./styles.module.scss";
import {
  decodeTransaction,
  decodeCellpack,
  projectOutputAlkanes,
  type AlkaneAmt,
  type Protostone,
  type Cellpack,
} from "./decode";
import { CONTRACT_NAME_OVERRIDES, ALKANE_NAME_OVERRIDES, opcodeLabel } from "./consts";
import AlkaneIcon from "@/ui/components/alkane-icon";
import {
  ArrowRightTxIcon,
  ArrowBendDownRightIcon,
  CaretRightBoldIcon,
} from "@/ui/icons/phosphor";
import { useControllersState } from "@/ui/states/controllerState";
import { useAssetManagerContext } from "@/ui/utils/assets-ctx";
import { useAppState } from "@/ui/states/appState";
import { useEspoQuery } from "@/ui/utils/query";
import { ss } from "@/ui/utils";
import { satoshisToAmount } from "@/shared/utils/transactions";
import { formatAlkaneAmount, alkaneSymbol } from "@/shared/utils/alkanes";
import {
  explorerTxUrl,
  explorerAddressUrl,
  explorerAlkaneUrl,
  networkInfo,
  networkSlug,
} from "@/shared/networks";
import {
  createContractProjector,
  type PoolSnapshot,
  type ProjectionVout,
} from "./contract-projection";
import { browserTabsCreate } from "@/shared/utils/browser";
import type {
  EspoEnrichedTx,
  EspoProtostone,
} from "@/background/controllers/apiController";
import { t } from "i18next";

interface Props {
  /** Finalized raw transaction hex (pre-broadcast path). */
  rawTx?: string;
  /**
   * A package of finalized raw transactions to review together (e.g. a CPFP
   * parent + child). With 2+ entries a segmented control above the card selects
   * which one is shown; a single entry renders exactly like `rawTx`. Takes
   * precedence over `rawTx` when non-empty.
   */
  rawTxs?: { hex: string; label?: string }[];
  /**
   * Raw hexes of OTHER locally-broadcast txs that may be unbroadcast
   * ANCESTORS of `rawTx` (e.g. the package sibling of an optimistic entry).
   * Actual ancestors are detected by txid and their projected vouts feed this
   * tx's vins, exactly like the package view; non-ancestors are ignored.
   */
  chainRawTxs?: string[];
  /**
   * A confirmed/pending txid (indexed path). May be accompanied by `rawTx` as
   * a local fallback: a just-broadcast tx renders from its own hex until espo
   * indexes the txid.
   */
  txid?: string;
  network: Network;
  /**
   * The user's address. On the rawTx path it labels the (own) input rows; on the
   * txid path it flags whichever real input/output addresses are the user's.
   */
  fromAddress?: string;
  /** sat/vB, shown in the fee pill when provided. */
  feeRate?: number;
}

/** espo's addr_prefix_suffix: ellipsize the head, always show the last chars. */
function addrParts(addr: string, suffixLen = 6): [string, string] {
  if (addr.length <= suffixLen) return [addr, ""];
  return [addr.slice(0, addr.length - suffixLen), addr.slice(addr.length - suffixLen)];
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const len = clean.length >> 1;
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    out[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return out;
}

/** Drop trailing 0x00 padding (the alkanes 15-byte message packing adds it). */
function stripTrailingZeroBytes(buf: Uint8Array): Uint8Array {
  let end = buf.length;
  while (end > 0 && buf[end - 1] === 0) end--;
  return buf.subarray(0, end);
}

/**
 * Map espo's decoded protostone shape (get_address_transactions runestone) onto
 * decode.ts's `Protostone`, so the same projection + OP_RETURN rendering the
 * rawTx path uses works unchanged. The message is hex(join_to_bytes(...)) — the
 * cellpack bytes — matching what the rawTx decoder produces before stripping.
 */
function mapEspoProtostones(pss: EspoProtostone[]): Protostone[] {
  return pss.map((ps) => {
    const bytes = ps.message && ps.message.length ? hexToBytes(ps.message) : new Uint8Array();
    const message = stripTrailingZeroBytes(bytes);
    return {
      protocolTag: 1n,
      edicts: (ps.edicts ?? []).map((e) => ({
        block: BigInt(e.id.block),
        tx: BigInt(e.id.tx),
        amount: BigInt(e.amount),
        output: e.output,
      })),
      pointer: ps.pointer != null ? ps.pointer : undefined,
      refundPointer: undefined,
      message: message.length ? message : undefined,
    };
  });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Syntax-highlighted JSON HTML, mirroring espo's render_json_value (jv-* spans). */
function renderJsonHtml(v: unknown, depth = 0): string {
  const indent = "  ".repeat(depth);
  const next = "  ".repeat(depth + 1);
  if (v === null || v === undefined) {
    return '<span class="jv-val null">null</span>';
  }
  if (typeof v === "boolean") {
    return `<span class="jv-val boolean">${v ? "true" : "false"}</span>`;
  }
  if (typeof v === "number") {
    return `<span class="jv-val number">${escapeHtml(String(v))}</span>`;
  }
  if (typeof v === "string") {
    return `<span class="jv-val string">${escapeHtml(JSON.stringify(v))}</span>`;
  }
  if (Array.isArray(v)) {
    if (!v.length) return '<span class="jv-brace">[]</span>';
    const items = v
      .map(
        (item, i) =>
          `${next}${renderJsonHtml(item, depth + 1)}${
            i + 1 !== v.length ? '<span class="jv-comma">,</span>' : ""
          }`
      )
      .join("\n");
    return `<span class="jv-brace">[</span>\n${items}\n${indent}<span class="jv-brace">]</span>`;
  }
  const entries = Object.entries(v as Record<string, unknown>);
  if (!entries.length) return '<span class="jv-brace">{}</span>';
  const rows = entries
    .map(([k, val], i) => {
      const key = escapeHtml(JSON.stringify(k));
      return `${next}<span class="jv-key">${key}</span><span class="jv-sep">: </span>${renderJsonHtml(
        val,
        depth + 1
      )}${i + 1 !== entries.length ? '<span class="jv-comma">,</span>' : ""}`;
    })
    .join("\n");
  return `<span class="jv-brace">{</span>\n${rows}\n${indent}<span class="jv-brace">}</span>`;
}

const openExplorer = (url: string) =>
  browserTabsCreate({ url, active: true }).catch(console.error);

/** An external explorer link that opens in a new tab (espo `.link` styling). */
const ExtLink: FC<{ href: string; className?: string; children: ReactNode }> = ({
  href,
  className,
  children,
}) => (
  <a
    className={className}
    href={href}
    onClick={(e) => {
      e.preventDefault();
      openExplorer(href);
    }}
  >
    {children}
  </a>
);

/** espo's balances_list: io-alkanes > alk-line (bend-down-right arrow + chip). */
const AlkanesList: FC<{
  items: AlkaneAmt[];
  sym: (id: string) => string;
  alkaneHref: (id: string) => string;
}> = ({ items, sym, alkaneHref }) =>
  items.length ? (
    <div className="io-alkanes">
      {items.map((a, i) => (
        <div className="alk-line" key={`${a.id}-${i}`}>
          <span className="alk-arrow" aria-hidden="true">
            <ArrowBendDownRightIcon size={16} />
          </span>
          <span className="alk-icon-wrap" aria-hidden="true">
            <AlkaneIcon id={a.id} symbol={sym(a.id)} />
          </span>
          <span className="alk-amt">{formatAlkaneAmount(a.amount.toString())}</span>
          <ExtLink className="alk-sym link" href={alkaneHref(a.id)}>
            {sym(a.id)}
          </ExtLink>
        </div>
      ))}
    </div>
  ) : null;

/**
 * An address row (io-addr-row): clickable ellipsized address + BTC amount. When
 * `label` is set (e.g. "You" for the user's own address) it replaces the
 * truncated address text while still linking to the same explorer page.
 */
const AddrRow: FC<{
  address?: string;
  href?: string;
  amount: string;
  label?: string;
}> = ({ address, href, amount, label }) => {
  const [prefix, suffix] = address ? addrParts(address) : ["", ""];
  return (
    <div className="io-addr-row">
      <div className="io-addr">
        {address && href ? (
          <ExtLink className="link addr-inline" href={href}>
            {label ? (
              <span className="addr-prefix">{label}</span>
            ) : (
              <>
                <span className="addr-prefix">{prefix}</span>
                <span className="addr-suffix">{suffix}</span>
              </>
            )}
          </ExtLink>
        ) : (
          <span className="addr-prefix">{label ?? address ?? "—"}</span>
        )}
      </div>
      <div className="io-amount">{amount}</div>
    </div>
  );
};

/** A single input row in the shared render model. */
interface VinModel {
  txid: string;
  vout: number;
  isCoinbase: boolean;
  address?: string;
  amount?: number;
  /** The prevout tx is package-internal (unbroadcast): no explorer link. */
  noLink?: boolean;
}
/** A single output row in the shared render model. */
interface VoutModel {
  address?: string;
  value: number;
  isOpReturn: boolean;
}
/** The unified view both sources (rawTx / txid) render from. */
interface TxView {
  txid: string;
  vins: VinModel[];
  vouts: VoutModel[];
  protostones: Protostone[];
  /** input outpoint "txid:vout" -> alkane balances */
  inputAlk: Map<string, AlkaneAmt[]>;
  /** vout index -> alkane balances (real-else-projected) */
  outputAlk: Map<number, AlkaneAmt[]>;
  source: "rawTx" | "txid";
  confirmed: boolean;
  traceStatus: "success" | "reverted" | "pending" | "none";
}

const toAmts = (
  entries?: { alkane: string; amount: string }[]
): AlkaneAmt[] => (entries ?? []).map((a) => ({ id: a.alkane, amount: BigInt(a.amount) }));

/** Sum a set of per-outpoint alkane balances into a flat seed list. */
function seedFrom(maps: AlkaneAmt[][]): AlkaneAmt[] {
  const m = new Map<string, bigint>();
  for (const list of maps) {
    for (const a of list) m.set(a.id, (m.get(a.id) ?? 0n) + a.amount);
  }
  return [...m].map(([id, amount]) => ({ id, amount }));
}

/**
 * Transaction overview card, a faithful port of espo's tx renderer: a two-column
 * Inputs/Outputs grid with directional arrows, clickable addresses, per-input and
 * per-output alkane balances, and the decoded OP_RETURN protostone (collapsible
 * message + a contract-call summary with the trace/pending status).
 */
const TransactionOverview: FC<Props> = ({
  rawTx,
  rawTxs,
  chainRawTxs,
  txid,
  network,
  fromAddress,
  feeRate,
}) => {
  const { apiController } = useControllersState(ss(["apiController"]));
  const { portfolio } = useAssetManagerContext();
  const { explorerUrl } = useAppState(ss(["explorerUrl"]));
  const override = explorerUrl?.[networkSlug(network)];

  // Package path: which transaction of `rawTxs` is on screen. Declared before
  // any early return so the hook order stays stable across render states.
  const [selected, setSelected] = useState(0);

  const pkg = rawTxs && rawTxs.length ? rawTxs : undefined;
  // Clamp: `rawTxs` can shrink under a stale selection.
  const activeIndex = pkg ? Math.min(selected, pkg.length - 1) : 0;
  // A single-entry package behaves exactly like the plain `rawTx` prop.
  const activeRawTx = pkg ? pkg[activeIndex].hex : rawTx;

  // Pre-broadcast path: decode the raw hex up front (also yields the query key).
  const decoded = useMemo(() => {
    if (!activeRawTx) return undefined;
    try {
      return decodeTransaction(activeRawTx, network);
    } catch {
      return undefined;
    }
  }, [activeRawTx, network]);

  // The whole package decoded, so a child tx's vins can be filled from the
  // PROJECTED vouts of its (unbroadcast) parent. Without an explicit package,
  // `chainRawTxs` candidates are decoded and only actual ancestors of the
  // active tx are kept, in dependency order (parents first).
  const pkgDecoded = useMemo(() => {
    try {
      if (pkg) return pkg.map((t) => decodeTransaction(t.hex, network));
      if (!chainRawTxs?.length || !activeRawTx) return undefined;
      const active = decodeTransaction(activeRawTx, network);
      const candidates = new Map<string, ReturnType<typeof decodeTransaction>>();
      for (const hex of chainRawTxs) {
        try {
          const d = decodeTransaction(hex, network);
          candidates.set(d.txid, d);
        } catch {
          // a bad candidate is just skipped
        }
      }
      const chain: ReturnType<typeof decodeTransaction>[] = [];
      const seen = new Set<string>([active.txid]);
      const visit = (d: ReturnType<typeof decodeTransaction>): void => {
        for (const v of d.vins) {
          const parent = candidates.get(v.txid);
          if (parent && !seen.has(parent.txid)) {
            seen.add(parent.txid);
            visit(parent);
            chain.push(parent);
          }
        }
      };
      visit(active);
      if (!chain.length) return undefined;
      chain.push(active);
      return chain;
    } catch {
      return undefined;
    }
  }, [pkg, chainRawTxs, activeRawTx, network]);

  const inOutpoints = useMemo(() => {
    const chain = pkgDecoded ?? (decoded ? [decoded] : []);
    const internal = new Set(chain.map((d) => d.txid));
    const ops: string[] = [];
    for (const d of chain) {
      for (const v of d.vins) {
        // package-internal prevouts don't exist on espo yet; their balances
        // come from the parent's projection instead
        if (!v.isCoinbase && !internal.has(v.txid)) {
          ops.push(`${v.txid}:${v.vout}`);
        }
      }
    }
    return [...new Set(ops)];
  }, [pkgDecoded, decoded]);

  const { data, isFetched } = useEspoQuery(
    ["tx-overview", txid ?? decoded?.txid ?? ""],
    async () => {
      if (txid) {
        const enriched = await apiController.getEnrichedTx(txid);
        if (!enriched) {
          /*
            Espo doesn't know the tx yet (a just-broadcast local one). When
            the caller also supplied the raw hex, render from the local decode
            like the pre-broadcast review; the poll below flips this to the
            indexed view the moment espo catches up.
          */
          if (decoded) {
            const [alkanes, values] = await Promise.all([
              apiController.getOutpointAlkanes(inOutpoints),
              apiController.getOutpointValues(inOutpoints),
            ]);
            return { kind: "rawTx" as const, alkanes, values };
          }
          return { kind: "txid" as const, enriched: undefined };
        }
        const inOps = (enriched.inputs ?? [])
          .filter((i) => !i.isCoinbase)
          .map((i) => `${i.txid}:${i.vout}`);
        const outOps = (enriched.outputs ?? []).map(
          (_, i) => `${enriched.txid}:${i}`
        );
        const [inAlk, outAlk, traceStatus] = await Promise.all([
          apiController.getOutpointAlkanes(inOps),
          apiController.getOutpointAlkanes(outOps),
          apiController.getTxTraceStatus(txid),
        ]);

        /*
          A mempool package child spends prevouts espo hasn't indexed yet, so
          its vins (and swap seed) would come up empty. Fetch any unconfirmed
          parent from history along with ITS input alkanes; the view walks the
          parent's projection into this tx exactly like the pre-broadcast
          package path.
        */
        const parents: Record<
          string,
          {
            enriched: EspoEnrichedTx;
            inAlk: Record<string, { alkane: string; amount: string }[]>;
          }
        > = {};
        if (!enriched.confirmed) {
          const parentTxids = [
            ...new Set(
              (enriched.inputs ?? [])
                .filter((i) => !i.isCoinbase)
                .map((i) => i.txid)
            ),
          ];
          await Promise.all(
            parentTxids.map(async (ptxid) => {
              const parent = await apiController.getEnrichedTx(ptxid);
              if (!parent || parent.confirmed) return;
              const pOps = (parent.inputs ?? [])
                .filter((i) => !i.isCoinbase)
                .map((i) => `${i.txid}:${i.vout}`);
              const pAlk = await apiController.getOutpointAlkanes(pOps);
              parents[ptxid] = { enriched: parent, inAlk: pAlk };
            })
          );
        }
        return {
          kind: "txid" as const,
          enriched,
          inAlk,
          outAlk,
          traceStatus,
          parents,
        };
      }
      const [alkanes, values] = await Promise.all([
        apiController.getOutpointAlkanes(inOutpoints),
        apiController.getOutpointValues(inOutpoints),
      ]);
      return { kind: "rawTx" as const, alkanes, values };
    },
    {
      enabled: !!txid || !!decoded,
      // A txid tx that espo has not indexed yet (mempool propagation) or that
      // is still unconfirmed keeps changing; poll instead of caching the miss
      // until the next block.
      refetchInterval: (data) =>
        txid && (!data || data.kind !== "txid" || !data.enriched || !data.enriched.confirmed)
          ? 10_000
          : false,
    }
  );

  // Signer script + pool reserves for the contract projection (espo's
  // mempool estimation model): lets the vouts show the frBTC a wrap will
  // mint or the token a swap will deliver, before any trace exists.
  const { data: projData } = useEspoQuery(["tx-projection-data"], () =>
    apiController.getProjectionData()
  );

  const symbolMap = useMemo(() => {
    const m = new Map<string, string>();
    portfolio?.alkanes.forEach((a) => m.set(a.id, a.symbol.toUpperCase()));
    return m;
  }, [portfolio]);
  const sym = (id: string) =>
    ALKANE_NAME_OVERRIDES[id] ?? alkaneSymbol(id, symbolMap);
  const alkaneHref = (id: string) => explorerAlkaneUrl(network, id, override);

  const view: TxView | undefined = useMemo(() => {
    if (!data) return undefined;

    const makeProjector = (pv: ProjectionVout[]) => {
      if (!projData) return undefined;
      const pools = new Map<string, PoolSnapshot>();
      for (const [id, p] of Object.entries(projData.pools)) {
        pools.set(id, {
          base: p.base,
          quote: p.quote,
          baseReserve: BigInt(p.baseReserve),
          quoteReserve: BigInt(p.quoteReserve),
        });
      }
      return createContractProjector(
        {
          frbtcId: "32:0",
          factoryId: networkInfo(network).ammFactoryId,
          signerScriptHex: projData.signerScriptHex,
          pools,
        },
        pv
      );
    };

    if (data.kind === "rawTx") {
      if (!decoded) return undefined;
      /*
        Walk the package from its first tx to the one on screen, projecting
        each tx's outputs and feeding them into the NEXT tx's vins wherever a
        vin spends a package-internal (still unbroadcast) prevout. So tx #2 of
        a wrap+swap package shows the minted frBTC arriving on its vin, then
        leaving as the bought token on its vout.
      */
      const chain = pkgDecoded ?? [decoded];
      const activeIdx = !pkgDecoded
        ? 0
        : pkg
        ? Math.min(activeIndex, chain.length - 1)
        : chain.length - 1;
      const indexByTxid = new Map(chain.map((d, i) => [d.txid, i] as const));

      const projectedOutputs: Map<number, AlkaneAmt[]>[] = [];
      let inputAlk = new Map<string, AlkaneAmt[]>();
      for (let ti = 0; ti <= activeIdx; ti++) {
        const d = chain[ti];
        const txInputAlk = new Map<string, AlkaneAmt[]>();
        for (const v of d.vins) {
          if (v.isCoinbase) continue;
          const op = `${v.txid}:${v.vout}`;
          const prevIdx = indexByTxid.get(v.txid);
          if (prevIdx !== undefined && prevIdx < ti) {
            const alks = projectedOutputs[prevIdx]?.get(v.vout) ?? [];
            if (alks.length) txInputAlk.set(op, alks);
          } else {
            const entries = data.alkanes?.[op];
            if (entries) txInputAlk.set(op, toAmts(entries));
          }
        }
        const spendable = d.vouts
          .map((o, i) => (o.isOpReturn ? -1 : i))
          .filter((i) => i >= 0);
        const outputAlk = projectOutputAlkanes(
          seedFrom([...txInputAlk.values()]),
          d.protostones,
          d.vouts.length,
          spendable,
          makeProjector(
            d.vouts.map((o) => ({ scriptHex: o.scriptHex, value: o.value }))
          )
        );
        projectedOutputs.push(outputAlk);
        if (ti === activeIdx) inputAlk = txInputAlk;
      }

      const active = chain[activeIdx];
      const vins: VinModel[] = active.vins.map((v) => {
        const prevIdx = indexByTxid.get(v.txid);
        const isLocal = prevIdx !== undefined && prevIdx < activeIdx;
        return {
          txid: v.txid,
          vout: v.vout,
          isCoinbase: v.isCoinbase,
          // rawTx: every non-coinbase input is the user's; a package-internal
          // one carries its parent vout's decoded address.
          address: v.isCoinbase
            ? undefined
            : isLocal
            ? chain[prevIdx!].vouts[v.vout]?.address ?? fromAddress
            : fromAddress,
          amount: isLocal
            ? chain[prevIdx!].vouts[v.vout]?.value
            : data.values?.[`${v.txid}:${v.vout}`],
          noLink: isLocal,
        };
      });
      const vouts: VoutModel[] = active.vouts.map((o) => ({
        address: o.address,
        value: o.value,
        isOpReturn: o.isOpReturn,
      }));
      const outputAlk = projectedOutputs[activeIdx];
      return {
        txid: active.txid,
        vins,
        vouts,
        protostones: active.protostones,
        inputAlk,
        outputAlk,
        source: "rawTx",
        confirmed: true,
        traceStatus: "none",
      };
    }

    // txid path
    const enriched = data.enriched;
    if (!enriched) return undefined;

    const inputAlk = new Map<string, AlkaneAmt[]>();
    for (const [op, entries] of Object.entries(data.inAlk ?? {})) {
      inputAlk.set(op, toAmts(entries));
    }

    /*
      Chain unconfirmed parents (mempool CPFP packages): project each parent's
      outputs and fill this tx's vins wherever espo had nothing indexed, so a
      package child shows the minted frBTC arriving and the swap result leaving
      even while both txs sit in the mempool.
    */
    for (const [ptxid, parent] of Object.entries(data.parents ?? {})) {
      const pEnriched = parent.enriched;
      const pInAlk = new Map<string, AlkaneAmt[]>();
      for (const [op, entries] of Object.entries(parent.inAlk ?? {})) {
        pInAlk.set(op, toAmts(entries));
      }
      const pVouts = (pEnriched.outputs ?? []).map((o) => ({
        scriptHex: o.scriptPubKey ?? "",
        value: o.amount ?? 0,
        isOpReturn:
          (o.scriptPubKey ?? "").toLowerCase().startsWith("6a") ||
          (!o.address && !o.scriptPubKeyType),
      }));
      const pSpendable = pVouts
        .map((o, i) => (o.isOpReturn ? -1 : i))
        .filter((i) => i >= 0);
      const pProjected = projectOutputAlkanes(
        seedFrom([...pInAlk.values()]),
        mapEspoProtostones(pEnriched.runestone?.protostones ?? []),
        pVouts.length,
        pSpendable,
        makeProjector(pVouts)
      );
      for (const i of enriched.inputs ?? []) {
        if (i.isCoinbase || i.txid !== ptxid) continue;
        const op = `${i.txid}:${i.vout}`;
        if (!inputAlk.has(op)) {
          const alks = pProjected.get(i.vout) ?? [];
          if (alks.length) inputAlk.set(op, alks);
        }
      }
    }

    const realOut = new Map<number, AlkaneAmt[]>();
    for (const [op, entries] of Object.entries(data.outAlk ?? {})) {
      const vout = Number(op.split(":")[1]);
      if (Number.isFinite(vout)) realOut.set(vout, toAmts(entries));
    }

    const vins: VinModel[] = (enriched.inputs ?? []).map((i) => ({
      txid: i.txid,
      vout: i.vout,
      isCoinbase: !!i.isCoinbase,
      address: i.address,
      amount: i.amount,
    }));
    const vouts: VoutModel[] = (enriched.outputs ?? []).map((o) => ({
      address: o.address,
      value: o.amount ?? 0,
      // An OP_RETURN output starts with 0x6a and carries no address; the
      // runestone body renders on it.
      isOpReturn:
        (o.scriptPubKey ?? "").toLowerCase().startsWith("6a") ||
        (!o.address && !o.scriptPubKeyType),
    }));

    const protostones = mapEspoProtostones(enriched.runestone?.protostones ?? []);
    const spendableVouts = vouts
      .map((o, i) => (o.isOpReturn ? -1 : i))
      .filter((i) => i >= 0);
    const seed = seedFrom([...inputAlk.values()]);
    const projected = projectOutputAlkanes(
      seed,
      protostones,
      vouts.length,
      spendableVouts,
      makeProjector(
        (enriched.outputs ?? []).map((o) => ({
          scriptHex: o.scriptPubKey ?? "",
          value: o.amount ?? 0,
        }))
      )
    );

    // espo's rule: show the REAL indexed balance if present, else the projection.
    const outputAlk = new Map<number, AlkaneAmt[]>();
    for (let i = 0; i < vouts.length; i++) {
      const real = realOut.get(i);
      const alks = real && real.length ? real : projected.get(i) ?? [];
      if (alks.length) outputAlk.set(i, alks);
    }

    return {
      txid: enriched.txid,
      vins,
      vouts,
      protostones,
      inputAlk,
      outputAlk,
      source: "txid",
      confirmed: !!enriched.confirmed,
      traceStatus: data.traceStatus ?? "none",
    };
  }, [data, decoded, pkgDecoded, activeIndex, fromAddress, projData, network]);

  /*
    Deploy-style cellpack targets: {5,n}/{6,n} clone a factory ({2,n}/{4,n} is
    the CODE source), {1,*}/{3,*} deploy new wasm. For display + ABI lookups
    the factory source is the real contract; the call is a deployment.
  */
  const deployTargetOf = (cell: Cellpack): { sourceId: string; isDeploy: boolean } => {
    const b = cell.target.block;
    if (b === 5n) return { sourceId: `2:${cell.target.tx}`, isDeploy: true };
    if (b === 6n) return { sourceId: `4:${cell.target.tx}`, isDeploy: true };
    const isDeploy = b === 1n || b === 3n || b === 4n;
    return { sourceId: `${cell.target.block}:${cell.target.tx}`, isDeploy };
  };

  // The contract targets of every decoded cellpack, so espo's ABI names/method
  // names can be resolved (essentials.get_alkane_info), the way the explorer does.
  const targetIds = useMemo(() => {
    const ids = new Set<string>();
    for (const ps of view?.protostones ?? []) {
      if (ps.message && ps.message.length) {
        const cell = decodeCellpack(ps.message);
        if (cell) ids.add(deployTargetOf(cell).sourceId);
      }
    }
    return [...ids];
  }, [view]);

  const { data: infoMap } = useEspoQuery(
    ["tx-overview-alkane-info", targetIds.join(",")],
    async () => {
      const out: Record<
        string,
        Awaited<ReturnType<typeof apiController.getAlkaneInfo>>
      > = {};
      await Promise.all(
        targetIds.map(async (id) => {
          out[id] = await apiController.getAlkaneInfo(id);
        })
      );
      return out;
    },
    { enabled: targetIds.length > 0 }
  );

  /**
   * The package switcher. Only rendered for a 2+ transaction package, so the
   * single-tx and txid paths keep their exact previous markup. The tabs are
   * deliberately agnostic ordinals ("Tx #1"), whatever the package contains.
   */
  const segmented: ReactNode =
    pkg && pkg.length > 1 ? (
      <div className={s.segmented} role="tablist">
        {pkg.map((_tx, i) => (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={i === activeIndex}
            className={`${s.segment}${i === activeIndex ? ` ${s.segmentActive}` : ""}`}
            onClick={() => setSelected(i)}
          >
            {`Tx #${i + 1}`}
          </button>
        ))}
      </div>
    ) : undefined;

  /** Stack the switcher above whichever state the selected tx is in. */
  const withSegmented = (body: ReactNode): ReactNode =>
    segmented ? (
      <div className={s.stack}>
        {segmented}
        {body}
      </div>
    ) : (
      body
    );

  if (activeRawTx && !decoded) {
    return (
      <>
        {withSegmented(
          <div className={s.error}>{t("transaction_overview.decode_error")}</div>
        )}
      </>
    );
  }
  if (!isFetched) {
    return (
      <>
        {withSegmented(
          <div className={s.loader}>
            <TailSpin className="animate-spin" width={26} height={26} />
          </div>
        )}
      </>
    );
  }
  if (!view) {
    // On the txid path an unfound tx usually just isn't indexed yet (mempool
    // propagation); the query above keeps polling, so show the loader rather
    // than declaring the tx undecodable.
    return (
      <>
        {withSegmented(
          txid ? (
            <div className={s.loader}>
              <TailSpin className="animate-spin" width={26} height={26} />
            </div>
          ) : (
            <div className={s.error}>{t("transaction_overview.decode_error")}</div>
          )
        )}
      </>
    );
  }

  const hasProtostone = view.protostones.length > 0;

  /** The contract-call result line: pending / reverted / successful, or the
   * pre-broadcast "determined after confirmation" note on the rawTx path. */
  const statusNode: ReactNode = (() => {
    if (view.source === "rawTx") {
      return (
        <div className="trace-status">
          <span className="trace-status-icon" aria-hidden="true">
            <ArrowBendDownRightIcon size={16} />
          </span>
          <span className="trace-status-text">
            {t("transaction_overview.result_pending")}
          </span>
        </div>
      );
    }
    if (!view.confirmed) {
      return (
        <div className="trace-status pending">
          <span className="trace-status-spinner" aria-hidden="true" />
          <span className="trace-status-text">
            {t("transaction_overview.waiting")}
          </span>
        </div>
      );
    }
    if (view.traceStatus === "reverted") {
      return (
        <div className="trace-status failure">
          <span aria-hidden="true">
            <ArrowBendDownRightIcon size={16} />
          </span>
          <span className="trace-status-text">
            {t("transaction_overview.call_reverted")}
          </span>
        </div>
      );
    }
    if (view.traceStatus === "success") {
      return (
        <div className="trace-status success">
          <span aria-hidden="true">
            <ArrowBendDownRightIcon size={16} />
          </span>
          <span className="trace-status-text">
            {t("transaction_overview.call_successful")}
          </span>
        </div>
      );
    }
    // Confirmed but the trace status couldn't be read: show no status line.
    return undefined;
  })();

  /**
   * The token route of a factory swap cellpack (subfrost-style chips). Ops
   * 13/14 carry the full path; op 29 names only the remaining hops, so the
   * input token is inferred from the tx's incoming alkanes when unambiguous.
   */
  const swapRoute = (cell: Cellpack): string[] | undefined => {
    const targetId = `${cell.target.block}:${cell.target.tx}`;
    if (targetId !== networkInfo(network).ammFactoryId) return undefined;
    const op = cell.opcode;
    if (op !== 13n && op !== 14n && op !== 29n) return undefined;
    const len = Number(cell.inputs[0] ?? 0n);
    if (!Number.isFinite(len) || len < 1) return undefined;
    const ids: string[] = [];
    for (let i = 0; i < len; i++) {
      const block = cell.inputs[1 + i * 2];
      const tx = cell.inputs[2 + i * 2];
      if (block === undefined || tx === undefined) return undefined;
      ids.push(`${block}:${tx}`);
    }
    if (op === 29n) {
      const inputIds = new Set<string>();
      for (const alks of view.inputAlk.values()) {
        for (const a of alks) inputIds.add(a.id);
      }
      const inferred = inputIds.size === 1 ? [...inputIds][0] : undefined;
      if (inferred && inferred !== ids[0]) ids.unshift(inferred);
    }
    return ids.length >= 2 ? ids : undefined;
  };

  const routeChips = (route: string[]) => (
    <div className={s.routeWrap}>
      <span className={s.routeLabel}>
        {t("transaction_overview.swap_route")}
      </span>
      <div className={s.route}>
        {route.map((id, i) => (
          <span key={`${id}-${i}`} className={s.routeStep}>
            <span className={s.routeNum}>{i + 1}</span>
            <span className={s.routeSym}>{sym(id)}</span>
            {i < route.length - 1 ? (
              <CaretRightBoldIcon size={12} className={s.routeArrow} />
            ) : undefined}
          </span>
        ))}
      </div>
    </div>
  );

  /** Per-cellpack contract-call summary (espo render_trace_summary shape).
      Deploy-style targets (factory clones {5,n}/{6,n}, new wasm {1..4})
      render as "Deploy:" with the CODE-source contract named. */
  const traceSummary = (cell: Cellpack) => {
    const { sourceId: targetId, isDeploy } = deployTargetOf(cell);
    const info = infoMap?.[targetId];
    const contractName =
      CONTRACT_NAME_OVERRIDES[targetId] ?? info?.name ?? targetId;
    const method = isDeploy
      ? `new instance of ${contractName}`
      : info?.methods.find((m) => m.opcode === Number(cell.opcode))?.name ??
        opcodeLabel(targetId, cell.opcode) ??
        t("transaction_overview.call_generic");
    return (
      <div className="trace-summary">
        <span className="trace-summary-label">
          {isDeploy ? "Deploy" : t("transaction_overview.contract_call")}:
        </span>
        <div className="trace-contract-row">
          <span className="trace-contract-icon" aria-hidden="true">
            <AlkaneIcon id={targetId} symbol={sym(targetId)} />
          </span>
          <div className="trace-contract-meta">
            <ExtLink
              className="trace-contract-name link"
              href={explorerAlkaneUrl(network, targetId, override)}
            >
              {contractName}
            </ExtLink>
          </div>
          <span className="io-arrow" aria-hidden="true">
            <ArrowRightTxIcon size={18} />
          </span>
        </div>
        <div className="trace-method-pill">
          <span className="trace-method-name">{method}</span>
          <span className="trace-opcode">
            {t("transaction_overview.opcode")} {cell.opcode.toString()}
          </span>
        </div>
        {(() => {
          const route = swapRoute(cell);
          return route ? routeChips(route) : undefined;
        })()}
        {statusNode}
      </div>
    );
  };

  const protostoneObj = view.protostones.map((ps) => ({
    protocolTag: ps.protocolTag.toString(),
    edicts: ps.edicts.map((e) => ({
      id: `${e.block}:${e.tx}`,
      amount: e.amount.toString(),
      output: e.output,
    })),
    pointer: ps.pointer ?? null,
    refundPointer: ps.refundPointer ?? null,
    message_hex: ps.message && ps.message.length ? toHex(ps.message) : "",
  }));
  const protostoneJsonHtml = renderJsonHtml(protostoneObj);

  const opReturnRow = (value: number, protostones: Protostone[]) => (
    <div className="io-addr-row opret-row">
      <details className="io-opret" open>
        <summary className="opret-summary">
          <span className="opret-left">
            <span className="opret-caret" aria-hidden="true">
              <CaretRightBoldIcon size={16} />
            </span>
            <span className="opret-title">
              OP_RETURN
              {hasProtostone ? (
                <>
                  {" ( "}
                  <span className="opret-meta">
                    <span className="opret-diamond" aria-hidden="true" />
                    {" "}
                    {t("transaction_overview.protostone_message")})
                  </span>
                </>
              ) : undefined}
            </span>
          </span>
          <span className="io-amount">{satoshisToAmount(value)} BTC</span>
        </summary>
      </details>
      <div className="opret-body protostone-body">
        {protostones.map((ps, i) => {
          const cell =
            ps.message && ps.message.length ? decodeCellpack(ps.message) : undefined;
          return cell ? (
            <div className="trace-view" key={i}>
              {traceSummary(cell)}
            </div>
          ) : undefined;
        })}
        {hasProtostone ? (
          <details className="opret-toggle">
            <summary className="opret-toggle-summary">
              <span className="opret-toggle-caret" aria-hidden="true">
                <CaretRightBoldIcon size={14} />
              </span>
              <span className="opret-toggle-label">
                {t("transaction_overview.protostone_message")}
              </span>
            </summary>
            <div className="opret-toggle-body">
              <div className="json-viewer json-only">
                <pre
                  className="json-raw"
                  dangerouslySetInnerHTML={{ __html: protostoneJsonHtml }}
                />
              </div>
            </div>
          </details>
        ) : undefined}
      </div>
    </div>
  );

  const card = (
    <div className={s.txCard}>
      <div className="tx-io-grid">
        <div className="io-col">
          <div className="io-col-title">{t("transaction_overview.inputs")}</div>
          <div className="io-list">
            {view.vins.map((vin, i) => {
              const outpoint = `${vin.txid}:${vin.vout}`;
              const val = vin.amount;
              const alks = view.inputAlk.get(outpoint) ?? [];
              return (
                <div className="io-row" key={i}>
                  {vin.isCoinbase || vin.noLink ? (
                    // package-internal prevouts aren't on espo yet: no link
                    <span className="io-arrow in" aria-hidden="true">
                      <ArrowRightTxIcon size={18} />
                    </span>
                  ) : (
                    <ExtLink
                      className="io-arrow io-arrow-link in"
                      href={explorerTxUrl(network, vin.txid, override)}
                    >
                      <ArrowRightTxIcon size={18} />
                    </ExtLink>
                  )}
                  <div className="io-main">
                    <AddrRow
                      address={vin.address}
                      href={
                        vin.address
                          ? explorerAddressUrl(network, vin.address, override)
                          : undefined
                      }
                      label={
                        vin.address && vin.address === fromAddress
                          ? t("transaction_overview.you")
                          : undefined
                      }
                      amount={val != null ? `${satoshisToAmount(val)} BTC` : "—"}
                    />
                    <AlkanesList items={alks} sym={sym} alkaneHref={alkaneHref} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="io-col">
          <div className="io-col-title">{t("transaction_overview.outputs")}</div>
          <div className="io-list">
            {view.vouts.map((vout, i) => {
              const alks = view.outputAlk.get(i) ?? [];
              return (
                <div className="io-row" key={i}>
                  <div className="io-main">
                    {vout.isOpReturn ? (
                      opReturnRow(vout.value, view.protostones)
                    ) : (
                      <AddrRow
                        address={vout.address}
                        href={
                          vout.address
                            ? explorerAddressUrl(network, vout.address, override)
                            : undefined
                        }
                        label={
                          vout.address && vout.address === fromAddress
                            ? t("transaction_overview.you")
                            : undefined
                        }
                        amount={`${satoshisToAmount(vout.value)} BTC`}
                      />
                    )}
                    <AlkanesList items={alks} sym={sym} alkaneHref={alkaneHref} />
                  </div>
                  <span
                    className={`io-arrow out${vout.isOpReturn ? " opret-arrow" : ""}`}
                    aria-hidden="true"
                  >
                    <ArrowRightTxIcon size={18} />
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {feeRate != null ? (
        <div className="tx-pill-row">
          <span className="tx-pill tx-pill-fee">
            {feeRate.toFixed(2)} {t("transaction_overview.sat_vb")}
          </span>
        </div>
      ) : undefined}
    </div>
  );

  return <>{withSegmented(card)}</>;
};

export default TransactionOverview;
