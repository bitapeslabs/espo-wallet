import { browserTabsCreate } from "@/shared/utils/browser";
import { CheckIcon } from "@/ui/icons/phosphor";

import s from "./styles.module.scss";
import { t } from "i18next";
import { explorerTxUrl } from "@/shared/networks";
import { Link, useParams } from "react-router-dom";
import { useAppState } from "@/ui/states/appState";
import { ss } from "@/ui/utils";

const FinalleSend = () => {
  const { txId } = useParams();
  const { network } = useAppState(ss(["network"]));
  const explorerUrl = txId ? explorerTxUrl(network, txId) : undefined;

  const onClick = async () => {
    if (!explorerUrl) return;
    await browserTabsCreate({
      active: true,
      url: explorerUrl,
    });
  };

  return (
    <div className={s.container}>
      <div className={s.iconCircle}>
        <CheckIcon size={44} />
      </div>
      <h3 className={s.title}>{t("send.finalle_send.success")}</h3>

      <div className={s.actions}>
        <Link to={"/"} className="btn ghost">
          {t("send.finalle_send.back")}
        </Link>
        {explorerUrl ? (
          <button className="btn" onClick={onClick}>
            {t("send.finalle_send.explorer")}
          </button>
        ) : undefined}
      </div>
    </div>
  );
};

export default FinalleSend;
