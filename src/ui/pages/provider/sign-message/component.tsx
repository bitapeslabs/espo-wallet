import { useControllersState } from "@/ui/states/controllerState";
import { useEffect, useState } from "react";

import Layout from "../layout";
import { t } from "i18next";
import { ss } from "@/ui/utils";
import s from "./styles.module.scss";

const SignMessage = () => {
  const [message, setMessage] = useState<string>();

  const { notificationController } = useControllersState(
    ss(["notificationController"])
  );

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    (async () => {
      const approval = await notificationController.getApproval();
      if (!approval || !approval.params) {
        await notificationController.rejectApproval("Invalid params");
        return;
      }
      setMessage(approval.params.data[0]);
    })();
  }, [notificationController]);

  return (
    <Layout
      documentTitle={t("provider.sign_request")}
      resolveBtnClassName="btn primary"
      resolveBtnText={t("provider.sign")}
    >
      <div className="panel">
        <div className="panel-head">{t("provider.sign_request")}</div>
        <div className="panel-sub">{t("provider.you_are_signing")}</div>
        <div className={s.message}>{message}</div>
      </div>
    </Layout>
  );
};

export default SignMessage;
