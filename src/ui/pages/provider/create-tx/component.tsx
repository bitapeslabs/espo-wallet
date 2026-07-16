import { useControllersState } from "@/ui/states/controllerState";
import { useEffect, useState } from "react";

import Layout from "../layout";
import type { CreateTxProps } from "@/shared/interfaces/notification";
import { t } from "i18next";
import { ss } from "@/ui/utils";
import s from "./styles.module.scss";

const CreateTx = () => {
  const [psbt, setPsbt] = useState<CreateTxProps>();

  const { notificationController } = useControllersState(
    ss(["notificationController"])
  );

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    (async () => {
      const approval = await notificationController.getApproval();
      if (!approval) {
        await notificationController.rejectApproval("Invalid params");
        return;
      }
      setPsbt(approval.params?.data[0]);
    })();
  }, [notificationController]);

  if (!psbt) return <></>;

  const fields = [
    {
      label: "Address",
      value: psbt.to,
    },
    {
      label: "Amount",
      value: `${psbt.amount / 10 ** 8} BTC`,
    },
    {
      label: "Fee Rate",
      value: `${psbt.feeRate} sat/Vb`,
    },
  ];

  return (
    <Layout
      documentTitle={t("provider.create_transaction")}
      resolveBtnClassName="btn primary"
      resolveBtnText={t("components.layout.send")}
    >
      <div className="panel">
        <div className="panel-head">{t("provider.send_bells")}</div>
        <div className={s.cards}>
          {fields.map((i) => (
            <div key={i.label} className="review-card stat">
              <div className="stat-label">{i.label}</div>
              <div className="stat-value">{i.value}</div>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
};

export default CreateTx;
