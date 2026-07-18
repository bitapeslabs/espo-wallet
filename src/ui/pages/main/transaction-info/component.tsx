import s from "./styles.module.scss";
import { TailSpin } from "react-loading-icons";
import { browserTabsCreate } from "@/shared/utils/browser";
import { useLocation, useParams } from "react-router-dom";
import {
  ITransaction,
  IActivityEntry,
  ActivityKind,
} from "@/shared/interfaces/api";
import { LinkIcon } from "@/ui/icons/phosphor";
import { FC, useCallback, useEffect, useId, useMemo, useState } from "react";
import Modal from "@/ui/components/modal";
import { shortAddress } from "@/shared/utils/transactions";
import { alkaneSymbol } from "@/shared/utils/alkanes";
import toast from "react-hot-toast";
import { t } from "i18next";
import { useGetCurrentAccount } from "@/ui/states/walletState";
import { explorerTxUrl, networkSlug } from "@/shared/networks";
import { useControllersState } from "@/ui/states/controllerState";
import { ss } from "@/ui/utils";
import { useTransactionManagerContext } from "@/ui/utils/tx-ctx";
import { useAssetManagerContext } from "@/ui/utils/assets-ctx";
import { useAppState } from "@/ui/states/appState";
import ActivityIcon from "../activity/activity-icon";

/** Header label per activity kind (a noun, unlike the feed's past-tense). */
const KIND_LABEL: Record<ActivityKind, string> = {
  buy: "swap",
  sell: "swap",
  wrap: "wrap",
  unwrap: "unwrap",
  split: "split",
  send: "transfer",
  receive: "transfer",
  liquidity_add: "add_liquidity",
  liquidity_remove: "remove_liquidity",
  pool_create: "create_pool",
  mint: "mint",
  other: "app_interaction",
};

const TransactionInfo = () => {
  const [openModal, setOpenModal] = useState<boolean>(false);
  const currentAccount = useGetCurrentAccount();
  const { apiController } = useControllersState(ss(["apiController"]));

  const { state } = useLocation();
  const { txId } = useParams();
  const { lastBlock, transactions } = useTransactionManagerContext();
  const [tx, setTx] = useState(
    (state?.transaction as ITransaction | undefined) ??
      transactions?.find((i) => i.txid === txId)
  );

  const { network, explorerUrl: explorerOverride } = useAppState(
    ss(["network", "explorerUrl"])
  );
  const explorerUrl = txId
    ? explorerTxUrl(network, txId, explorerOverride?.[networkSlug(network)])
    : undefined;

  // The classified activity entry, passed in when opened from the activity feed
  // (drives the icon + kind header above the card). Absent for other entries.
  const activity = state?.activity as IActivityEntry | undefined;
  const { portfolio } = useAssetManagerContext();
  const symbolMap = useMemo(() => {
    const m = new Map<string, string>();
    portfolio?.alkanes.forEach((a) => m.set(a.id, a.symbol.toUpperCase()));
    return m;
  }, [portfolio]);
  const sym = useCallback(
    (id: string) => {
      if (id === "btc") return portfolio?.btc?.symbol?.toUpperCase() ?? "BTC";
      const symbol = alkaneSymbol(id, symbolMap);
      return symbol.toLowerCase() === "frbtc" ? "frBTC" : symbol;
    },
    [portfolio, symbolMap]
  );

  const onOpenExplorer = async () => {
    if (!explorerUrl) return;
    await browserTabsCreate({
      url: explorerUrl,
      active: true,
    });
  };

  useEffect(() => {
    if (!state?.transaction && txId) {
      apiController.getTransaction(txId).then(setTx).catch(console.error);
    }
  }, [state?.transaction, txId, apiController]);

  return (
    <div className={s.transactionInfoDiv}>
      {tx ? (
        <>
          {activity ? (
            <div className={s.overviewHead}>
              <span className={s.overviewIcon}>
                <ActivityIcon entry={activity} network={network} sym={sym} />
              </span>
              <span className={s.overviewKind}>
                {t(`transaction_info.kind.${KIND_LABEL[activity.kind]}`)}
              </span>
            </div>
          ) : undefined}
          <div className={s.transaction}>
            <div className="panel">
              <div className={s.group}>
                <p className={s.transactionP}>{t("transaction_info.txid")}</p>

                <span>{tx.txid}</span>
              </div>
              <div className={s.group}>
                <p className={s.transactionP}>
                  {t("transaction_info.confirmations_label")}
                </p>
                <span>
                  {tx.status.confirmed && lastBlock
                    ? lastBlock - tx.status.block_height + 1
                    : "Unconfirmed"}
                </span>
              </div>
              <div className={s.group}>
                <p className={s.transactionP}>
                  {t("transaction_info.fee_label")}
                </p>
                <span>{tx.fee / 10 ** 8} BTC</span>
              </div>
              <div className={s.group}>
                <p className={s.transactionP}>
                  {t("transaction_info.value_label")}
                </p>
                <span>
                  {tx.vout.reduce((acc, cur) => cur.value + acc, 0) / 10 ** 8}{" "}
                  BTC
                </span>
              </div>

              <div className={s.summary} onClick={() => setOpenModal(true)}>
                <LinkIcon size={16} /> {t("transaction_info.details")}
              </div>
            </div>

            <Modal
              onClose={() => setOpenModal(false)}
              open={openModal}
              title={t("transaction_info.details")}
            >
              <div className={s.tableContainer}>
                <TableItem
                  label={t("transaction_info.inputs")}
                  currentAddress={currentAccount?.address}
                  items={tx.vin
                    .filter((i) => typeof i.prevout !== "undefined")
                    .map((i) => ({
                      scriptpubkey_address: i.prevout!.scriptpubkey_address,
                      value: i.prevout!.value,
                    }))}
                />
                <TableItem
                  label={t("transaction_info.outputs")}
                  currentAddress={currentAccount?.address}
                  items={tx.vout}
                />
              </div>
            </Modal>
          </div>
          {explorerUrl ? (
            <button className="bottom-btn" onClick={onOpenExplorer}>
              {t("transaction_info.open_in_explorer")}
            </button>
          ) : undefined}
        </>
      ) : (
        <TailSpin className="animate-spin" />
      )}
    </div>
  );
};

interface ITableItem {
  items: {
    scriptpubkey_address: string;
    value: number;
  }[];
  currentAddress?: string;
  label: string;
}

const TableItem: FC<ITableItem> = ({ items, currentAddress, label }) => {
  const currentId = useId();

  const addressLength = (value: number) => {
    const newValue = (value / 10 ** 8).toFixed(2);
    if (newValue.length > 7) {
      return 9;
    }
    return 12;
  };

  return (
    <div className={s.table}>
      <h3>{label}:</h3>
      <div className={s.tableList}>
        {items.map((i, idx) => (
          <div key={`${currentId}${idx}`} className={s.tableItem}>
            <div className={s.tableGroup}>
              <span>#{idx}</span>
              <span className={s.tableSecond}>
                {(i.value / 10 ** 8).toFixed(8)} BTC
              </span>
            </div>

            <div
              className={s.address}
              onClick={async () => {
                await navigator.clipboard.writeText(i.scriptpubkey_address);
                toast.success(t("transaction_info.copied"));
              }}
             
            >
              {i.scriptpubkey_address === currentAddress
                ? t("transaction_info.your_address")
                : shortAddress(i.scriptpubkey_address, addressLength(i.value))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TransactionInfo;
