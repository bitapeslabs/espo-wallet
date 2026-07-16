import type { ConnectedSite } from "@/background/services/permission";
import { useControllersState } from "@/ui/states/controllerState";
import { useEffect, useState } from "react";
import s from "./styles.module.scss";
import { XIcon } from "@/ui/icons/phosphor";
import { t } from "i18next";
import { ss } from "@/ui/utils";

const ConnectedSites = () => {
  const [connectedSites, setConnectedSites] = useState<ConnectedSite[]>([]);
  const { notificationController } = useControllersState(
    ss(["notificationController"])
  );

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    notificationController.getConnectedSites().then(setConnectedSites);
  }, [notificationController]);

  const niceUrl = (url: string) => {
    if (url.includes("http://")) return url.replace("http://", "");
    return url.replace("https://", "");
  };

  const removeSite = async (origin: string) => {
    setConnectedSites(await notificationController.removeSite(origin));
  };

  return (
    <div className={s.wrapper}>
      {connectedSites.length > 0 ? (
        <div className={`panel ${s.sitesPanel}`}>
          <div className="svc-list">
            {connectedSites.map((f, i) => (
              <div key={i} className="svc-row">
                <div className="svc-id">
                  <div className="svc-name">
                    <img src={f.icon} className={s.favicon} alt="" />
                    <span>{niceUrl(f.origin)}</span>
                  </div>
                </div>
                <button
                  className={s.remove}
                  type="button"
                  onClick={() => {
                    // eslint-disable-next-line @typescript-eslint/no-floating-promises
                    removeSite(f.origin);
                  }}
                >
                  <XIcon size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className={s.empty}>{t("connected_sites.no_sites_message")}</p>
      )}
    </div>
  );
};

export default ConnectedSites;
