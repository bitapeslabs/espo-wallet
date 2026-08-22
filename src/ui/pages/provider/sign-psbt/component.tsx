import { Component, type ReactNode, useEffect, useState } from "react";

import Layout from "../layout";
import { TailSpin } from "react-loading-icons";
import { t } from "i18next";
import { Psbt } from "bitcoinjs-lib";
import TransactionOverview from "@/ui/components/transaction-overview";
import { useGetCurrentAccount } from "@/ui/states/walletState";
import { useAppState } from "@/ui/states/appState";
import { useControllersState } from "@/ui/states/controllerState";
import { ss } from "@/ui/utils";
import type { SignPsbtOptions } from "@/shared/interfaces/provider";
import s from "./styles.module.scss";

/*
  Dapp signPsbt approval. Renders the SAME transaction-overview card the
  wallet's own swap/transfer confirmations use: decoded protostones, the
  projected alkanes on every vout, contract-call trace summaries — instead
  of the old bare BTC in/out field list. The tx is still unsigned here, so
  the overview decodes the psbt's embedded unsigned transaction.
*/

const SIGHASH_SINGLE_ANYONECANPAY = 131;

/*
  A render error inside the overview must never blank the approval window —
  the user still needs working Reject/Sign buttons. The fallback shows the
  exception where a screenshot can catch it.
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

const SignPsbt = () => {
  const currentAccount = useGetCurrentAccount();
  const { network } = useAppState(ss(["network"]));
  /*
    MUST be the port-backed proxy: importing the background controller
    module directly executes against a fresh in-popup NotificationService
    whose approval slot is always empty (the real one lives in the service
    worker), so getApproval would answer undefined forever.
  */
  const { notificationController } = useControllersState(
    ss(["notificationController"])
  );
  const [rawTx, setRawTx] = useState<string | undefined>(undefined);
  const [options, setOptions] = useState<SignPsbtOptions | undefined>(
    undefined
  );
  const [loadError, setLoadError] = useState<string | undefined>(undefined);

  useEffect(() => {
    void (async () => {
      try {
        const approval = await notificationController.getApproval();
        const params = approval?.params?.data as
          | [string, SignPsbtOptions?]
          | undefined;
        if (!params || typeof params[0] !== "string") {
          await notificationController.rejectApproval("Invalid psbt");
          return;
        }
        const psbt = Psbt.fromBase64(params[0], { network });
        setRawTx(
          psbt.data.globalMap.unsignedTx.toBuffer().toString("hex")
        );
        setOptions(params[1]);
      } catch (e) {
        console.error("sign-psbt approval load failed", e);
        setLoadError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [network, notificationController]);

  const deployContext =
    options?.context?.kind === "deploy-commit" ? options.context : undefined;
  const dangerousSighash = (options?.toSignInputs ?? []).some((input) =>
    (input.sighashTypes ?? []).includes(SIGHASH_SINGLE_ANYONECANPAY)
  );

  if (loadError) {
    return (
      <Layout
        documentTitle={t("provider.sign_tx")}
        resolveBtnClassName="btn primary"
        resolveBtnText={t("provider.sign")}
      >
        <div className="panel">
          <div className="panel-head">{t("provider.sign_tx")}</div>
          <div className="review-card stat">
            <div className="stat-label">{t("provider.warning")}</div>
            <div className="stat-value">{loadError}</div>
          </div>
        </div>
      </Layout>
    );
  }

  if (!rawTx) return <TailSpin className="animate-spin" />;

  return (
    <Layout
      documentTitle={t("provider.sign_tx")}
      resolveBtnClassName="btn primary"
      resolveBtnText={t("provider.sign")}
    >
      <div className="panel">
        <div className="panel-head">{t("provider.sign_tx")}</div>

        {deployContext ? (
          <div className={`review-card stat ${s.deployCard}`}>
            <div className="stat-label">{t("provider.deploy")}</div>
            <div className="stat-value">
              {deployContext.wasmBytes
                ? t("provider.deploy_commit_desc", {
                    size: Math.round(deployContext.wasmBytes / 1024),
                  })
                : t("provider.deploy_commit_desc_nosize")}
            </div>
          </div>
        ) : null}

        {dangerousSighash ? (
          <div className={`review-card stat ${s.warnCard}`}>
            <div className="stat-label">{t("provider.warning")}</div>
            <div className="stat-value">
              {t("provider.anyone_can_pay_warning")}
            </div>
          </div>
        ) : null}

        <OverviewBoundary>
          <TransactionOverview
            rawTx={rawTx}
            network={network}
            fromAddress={currentAccount?.address}
          />
        </OverviewBoundary>
      </div>
    </Layout>
  );
};

export default SignPsbt;
