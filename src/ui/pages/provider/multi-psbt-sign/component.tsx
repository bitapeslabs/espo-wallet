import { Component, type ReactNode, useEffect, useMemo, useState } from "react";

import Layout from "../layout";
import { TailSpin } from "react-loading-icons";
import { t } from "i18next";
import { Psbt } from "bitcoinjs-lib";
import TransactionOverview from "@/ui/components/transaction-overview";
import {
  CaretLeftBoldIcon,
  CaretRightBoldIcon,
} from "@/ui/icons/phosphor";
import { useGetCurrentAccount } from "@/ui/states/walletState";
import { useAppState } from "@/ui/states/appState";
import { useControllersState } from "@/ui/states/controllerState";
import { ss } from "@/ui/utils";
import type { SignPsbtOptions } from "@/shared/interfaces/provider";
import s from "./styles.module.scss";

/*
  Dapp multiPsbtSign approval: ONE popup for a whole package (e.g. the
  cheese wizard's 4-token clone chain). Each transaction renders through
  the shared TransactionOverview — decoded protostones, projected alkanes
  per vout — paginated with arrow buttons. Every OTHER unsigned tx in the
  batch is passed as a chain ancestor candidate, so a chained child's
  inputs project from its (unbroadcast) parent.
*/

class OverviewBoundary extends Component<
  { children: ReactNode },
  { error?: Error }
> {
  state: { error?: Error } = {};
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="review-card stat">
          <div className="stat-label">
            {t("provider.overview_unavailable")}
          </div>
          <div className="stat-value">{this.state.error.message}</div>
        </div>
      );
    }
    return this.props.children;
  }
}

const MultiPsbtSign = () => {
  const currentAccount = useGetCurrentAccount();
  const { network } = useAppState(ss(["network"]));
  const { notificationController } = useControllersState(
    ss(["notificationController"])
  );
  const [rawTxs, setRawTxs] = useState<string[] | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | undefined>(undefined);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    void (async () => {
      try {
        const approval = await notificationController.getApproval();
        const items = approval?.params?.data?.[0] as
          | { psbtBase64: string; options?: SignPsbtOptions }[]
          | undefined;
        if (!Array.isArray(items) || items.length === 0) {
          await notificationController.rejectApproval("Invalid psbts");
          return;
        }
        setRawTxs(
          items.map((item) =>
            Psbt.fromBase64(item.psbtBase64, { network })
              .data.globalMap.unsignedTx.toBuffer()
              .toString("hex")
          )
        );
      } catch (e) {
        console.error("multi-psbt-sign approval load failed", e);
        setLoadError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [network, notificationController]);

  const chainRawTxs = useMemo(
    () => (rawTxs ?? []).filter((_, i) => i !== index),
    [rawTxs, index]
  );

  if (loadError) {
    return (
      <Layout
        documentTitle={t("provider.sign_multiple_txs")}
        resolveBtnClassName="btn primary"
        resolveBtnText={t("provider.sign")}
      >
        <div className="panel">
          <div className="panel-head">{t("provider.sign_multiple_txs")}</div>
          <div className="review-card stat">
            <div className="stat-label">{t("provider.warning")}</div>
            <div className="stat-value">{loadError}</div>
          </div>
        </div>
      </Layout>
    );
  }

  if (!rawTxs) return <TailSpin className="animate-spin" />;

  return (
    <Layout
      documentTitle={t("provider.sign_multiple_txs")}
      resolveBtnClassName="btn primary"
      resolveBtnText={t("provider.sign_all_count", { count: rawTxs.length })}
    >
      <div className="panel">
        <div className="panel-head">{t("provider.sign_multiple_txs")}</div>

        <div className={s.pager}>
          <button
            className={`btn ghost small ${s.pagerBtn}`}
            disabled={index === 0}
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            aria-label={t("provider.previous_tx")}
          >
            <CaretLeftBoldIcon size={14} />
          </button>
          <span className={s.pagerLabel}>
            {t("provider.tx_n_of_m", { n: index + 1, m: rawTxs.length })}
          </span>
          <button
            className={`btn ghost small ${s.pagerBtn}`}
            disabled={index === rawTxs.length - 1}
            onClick={() =>
              setIndex((i) => Math.min(rawTxs.length - 1, i + 1))
            }
            aria-label={t("provider.next_tx")}
          >
            <CaretRightBoldIcon size={14} />
          </button>
        </div>

        <OverviewBoundary key={index}>
          <TransactionOverview
            rawTx={rawTxs[index]}
            chainRawTxs={chainRawTxs}
            network={network}
            fromAddress={currentAccount?.address}
          />
        </OverviewBoundary>
      </div>
    </Layout>
  );
};

export default MultiPsbtSign;
