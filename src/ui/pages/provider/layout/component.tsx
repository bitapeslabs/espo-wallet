import { useControllersState } from "@/ui/states/controllerState";
import s from "./styles.module.scss";
import { FC, useEffect, useState } from "react";
import { TailSpin } from "react-loading-icons";
import { t } from "i18next";
import { ss } from "@/ui/utils";

interface Props {
  documentTitle: string;
  children: React.ReactNode;
  resolveBtnText?: string;
  resolveBtnClassName: string;
}

const Layout: FC<Props> = ({
  children,
  documentTitle,
  resolveBtnClassName,
  resolveBtnText,
}) => {
  const [origin, setOrigin] = useState<string>("");
  const [iconUrl, setIconUrl] = useState<string>("");
  const [siteName, setSiteName] = useState<string>("");

  const { notificationController } = useControllersState(
    ss(["notificationController"])
  );

  useEffect(() => {
    document.title = documentTitle;
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    (async () => {
      const approval = await notificationController.getApproval();
      if (!approval || !approval.params) {
        await notificationController.rejectApproval("Invalid params");
        return;
      }
      setOrigin(approval.params.session.origin);
      setIconUrl(approval.params.session.icon);
      setSiteName(approval.params.session.name);
    })();
  }, [documentTitle, notificationController]);

  if (!origin) {
    return (
      <div className={s.loader}>
        <TailSpin className="animate-spin" />
      </div>
    );
  }

  const onResolve = async () => {
    await notificationController.resolveApproval();
  };

  const onReject = async () => {
    await notificationController.rejectApproval();
  };

  return (
    <div className={s.container}>
      <div className={s.siteCard}>
        {iconUrl ? (
          <img src={iconUrl} className={s.siteIcon} alt="" />
        ) : undefined}
        {siteName ? <div className={s.siteName}>{siteName}</div> : undefined}
        <div className={s.siteOrigin}>{origin}</div>
      </div>
      <div className={s.content}>{children}</div>
      <div className={s.actions}>
        <button className="btn ghost" onClick={onReject}>
          {t("provider.reject")}
        </button>
        <button className={resolveBtnClassName} onClick={onResolve}>
          {resolveBtnText ?? t("provider.resolve")}
        </button>
      </div>
    </div>
  );
};

export default Layout;
