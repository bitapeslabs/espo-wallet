import { useEffect, useState } from "react";

import Layout from "../layout";
import { TailSpin } from "react-loading-icons";
import { t } from "i18next";
import { Psbt } from "bitcoinjs-lib";
import notificationController from "@/background/controllers/notificationController";
import TransactionOverview from "@/ui/components/transaction-overview";
import { useGetCurrentAccount } from "@/ui/states/walletState";
import { useAppState } from "@/ui/states/appState";
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

const SignPsbt = () => {
  const currentAccount = useGetCurrentAccount();
  const { network } = useAppState(ss(["network"]));
  const [rawTx, setRawTx] = useState<string | undefined>(undefined);
  const [options, setOptions] = useState<SignPsbtOptions | undefined>(
    undefined
  );

  useEffect(() => {
    void (async () => {
      const approval = await notificationController.getApproval();
      const params = approval?.params?.data as
        | [string, SignPsbtOptions?]
        | undefined;
      if (!params || typeof params[0] !== "string") {
        await notificationController.rejectApproval("Invalid psbt");
        return;
      }
      try {
        const psbt = Psbt.fromBase64(params[0], { network });
        setRawTx(
          psbt.data.globalMap.unsignedTx.toBuffer().toString("hex")
        );
        setOptions(params[1]);
      } catch {
        await notificationController.rejectApproval("Invalid psbt");
      }
    })();
  }, [network]);

  const deployContext =
    options?.context?.kind === "deploy-commit" ? options.context : undefined;
  const dangerousSighash = (options?.toSignInputs ?? []).some((input) =>
    (input.sighashTypes ?? []).includes(SIGHASH_SINGLE_ANYONECANPAY)
  );

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
            <div className="stat-label">Deploy</div>
            <div className="stat-value">
              New contract — commit transaction
              {deployContext.wasmBytes
                ? ` (${Math.round(deployContext.wasmBytes / 1024)} KB wasm)`
                : ""}
              . The reveal carrying the code follows automatically.
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

        <TransactionOverview
          rawTx={rawTx}
          network={network}
          fromAddress={currentAccount?.address}
        />
      </div>
    </Layout>
  );
};

export default SignPsbt;
