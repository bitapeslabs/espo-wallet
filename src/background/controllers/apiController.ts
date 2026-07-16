import type {
  AccountBalanceResponse,
  ApiUTXO,
  IAccountStats,
  ITransaction,
} from "@/shared/interfaces/api";
import { customFetch, fetchProps } from "@/shared/utils";
import { storageService } from "../services";
import { DEFAULT_FEES } from "@/shared/constant";
import { isValidTXID } from "@/ui/utils";
import { networkInfo, networkSlug } from "@/shared/networks";

export interface UtxoQueryParams {
  hex?: boolean;
  amount?: number;
}

interface MempoolFeesRecommended {
  fastestFee: number;
  halfHourFee: number;
  hourFee: number;
  economyFee: number;
  minimumFee: number;
}

export interface IApiController {
  getUtxos(
    address: string,
    params?: UtxoQueryParams
  ): Promise<ApiUTXO[] | undefined>;
  pushTx(rawTx: string): Promise<{ txid?: string; error?: string }>;
  getTransactions(address: string): Promise<ITransaction[] | undefined>;
  getPaginatedTransactions(
    address: string,
    txid: string
  ): Promise<ITransaction[] | undefined>;
  getBTCPrice(): Promise<number | undefined>;
  getLastBlock(): Promise<number | undefined>;
  getFees(): Promise<{ fast: number; slow: number } | undefined>;
  getAccountStats(address: string): Promise<IAccountStats | undefined>;
  getTransactionHex(txid: string): Promise<string | undefined>;
  getTransaction(txid: string): Promise<ITransaction | undefined>;
  getUtxoValues(outpoints: string[]): Promise<number[] | undefined>;
}

type FetchType = <T>(
  props: Omit<fetchProps, "baseUrl">
) => Promise<T | undefined>;

class ApiController implements IApiController {
  /** The active network's esplora base URL: the user's override or default */
  private get baseUrl(): string {
    const network = storageService.appState.network;
    const slug = networkSlug(network);
    const override = storageService.appState.esploraUrl?.[slug];
    if (override && override.trim().length) {
      return override.trim().replace(/\/+$/, "");
    }
    return networkInfo(network).esploraUrl;
  }

  private get isMainnet(): boolean {
    return networkSlug(storageService.appState.network) === "mainnet";
  }

  private fetch: FetchType = async (p: Omit<fetchProps, "baseUrl">) => {
    try {
      return await customFetch({
        ...p,
        baseUrl: this.baseUrl,
      });
    } catch {
      return;
    }
  };

  async getUtxos(address: string, params?: UtxoQueryParams) {
    const data = await this.fetch<ApiUTXO[]>({
      path: `/address/${address}/utxo`,
    });
    if (!Array.isArray(data)) return;

    // esplora returns every utxo; emulate the old server-side selection by
    // greedily picking the largest utxos until the requested amount is covered
    let utxos = data.sort((a, b) => b.value - a.value);
    if (params?.amount !== undefined) {
      const selected: ApiUTXO[] = [];
      let sum = 0;
      for (const utxo of utxos) {
        selected.push(utxo);
        sum += utxo.value;
        if (sum >= params.amount) break;
      }
      utxos = selected;
    }

    if (params?.hex) {
      await Promise.all(
        utxos.map(async (utxo) => {
          utxo.hex = await this.getTransactionHex(utxo.txid);
        })
      );
    }

    return utxos;
  }

  async getFees() {
    if (this.isMainnet) {
      const data = await this.fetch<MempoolFeesRecommended>({
        path: "/v1/fees/recommended",
      });
      if (data) {
        return {
          fast: data.fastestFee,
          slow: data.hourFee,
        };
      }
    }
    const data = await this.fetch<Record<string, number>>({
      path: "/fee-estimates",
    });
    if (data && "2" in data && "6" in data) {
      return {
        slow: Math.max(Number(data["6"].toFixed(0)), 1),
        fast: Math.max(Number(data["2"].toFixed(0)), 1),
      };
    }
    return DEFAULT_FEES;
  }

  async pushTx(rawTx: string) {
    const data = await this.fetch<string>({
      path: "/tx",
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
      },
      json: false,
      body: rawTx,
    });
    if (isValidTXID(data) && data) {
      return {
        txid: data,
      };
    } else {
      return {
        error: data,
      };
    }
  }

  async getTransactions(address: string): Promise<ITransaction[] | undefined> {
    return await this.fetch<ITransaction[]>({
      path: `/address/${address}/txs`,
    });
  }

  async getPaginatedTransactions(
    address: string,
    txid: string
  ): Promise<ITransaction[] | undefined> {
    try {
      return await this.fetch<ITransaction[]>({
        path: `/address/${address}/txs/chain/${txid}`,
      });
    } catch {
      return undefined;
    }
  }

  async getLastBlock() {
    const data = await this.fetch<string>({
      path: "/blocks/tip/height",
      json: false,
    });
    if (data) {
      return Number(data);
    }
  }

  async getBTCPrice(): Promise<number | undefined> {
    // always the real BTC price from mempool.space; regtest coins are
    // valued the same as mainnet BTC
    try {
      const data = await customFetch<{ USD: number }>({
        path: "/v1/prices",
        baseUrl: "https://mempool.space/api",
      });
      if (!data || typeof data.USD !== "number") return undefined;
      return data.USD;
    } catch {
      return undefined;
    }
  }

  async getAccountStats(address: string): Promise<IAccountStats | undefined> {
    try {
      const data = await this.fetch<AccountBalanceResponse>({
        path: `/address/${address}`,
      });
      if (!data) return { amount: 0, count: 0, balance: 0 };
      const chain = data.chain_stats;
      const mempool = data.mempool_stats;
      const balance =
        chain.funded_txo_sum -
        chain.spent_txo_sum +
        mempool.funded_txo_sum -
        mempool.spent_txo_sum;
      return {
        balance,
        amount: 0,
        count: chain.tx_count + mempool.tx_count,
      };
    } catch {
      return { amount: 0, count: 0, balance: 0 };
    }
  }

  async getTransaction(txid: string) {
    return await this.fetch<ITransaction>({
      path: "/tx/" + txid,
    });
  }

  async getTransactionHex(txid: string) {
    return await this.fetch<string>({
      path: "/tx/" + txid + "/hex",
      json: false,
    });
  }

  async getUtxoValues(outpoints: string[]) {
    // esplora has no batch endpoint; look prev-tx outputs up one by one,
    // deduplicating txids
    const txids = [...new Set(outpoints.map((o) => o.split(":")[0]))];
    const txs = await Promise.all(txids.map((txid) => this.getTransaction(txid)));
    const byTxid = new Map(txids.map((txid, i) => [txid, txs[i]]));

    const values = outpoints.map((outpoint) => {
      const [txid, voutStr] = outpoint.split(":");
      const tx = byTxid.get(txid);
      if (!tx) return undefined;
      return tx.vout[Number(voutStr)]?.value;
    });

    if (values.some((v) => v === undefined)) return undefined;
    return values as number[];
  }
}

export default new ApiController();
