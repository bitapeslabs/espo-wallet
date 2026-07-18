import { useControllersState } from "@/ui/states/controllerState";
import { useEffect, useState } from "react";

import Layout from "../layout";
import { t } from "i18next";
import { ss } from "@/ui/utils";
import NetworkIcon from "@/ui/components/network-icon";
import { networkFromSlug } from "@/shared/networks";
import s from "./styles.module.scss";

const SwitchNetwork = () => {
  const [networkName, setNetworkName] = useState<string>();

  const { notificationController } = useControllersState(
    ss(["notificationController"])
  );

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    (async () => {
      const approval = await notificationController.getApproval();
      if (!approval || !approval.params || !approval.params.data)
        await notificationController.rejectApproval("Invalid network");
      if (approval!.params!.data[0] === "regtest") setNetworkName("Regtest");
      else setNetworkName("Mainnet");
    })();
  }, [notificationController]);

  return (
    <Layout
      documentTitle={t("provider.switch_network_title")}
      resolveBtnClassName="btn primary"
      resolveBtnText={t("provider.switch")}
    >
      <div className={`panel ${s.card}`}>
        <h3 className={s.title}>{t("provider.switch_network_request")}</h3>
        <p className={s.sub}>{t("provider.switch_network")}</p>
        {networkName ? (
          <div className={s.network}>
            <NetworkIcon
              network={networkFromSlug(
                networkName === "Regtest" ? "regtest" : "mainnet"
              )}
              size={22}
            />
            <span>{networkName}</span>
          </div>
        ) : undefined}
      </div>
    </Layout>
  );
};

export default SwitchNetwork;
