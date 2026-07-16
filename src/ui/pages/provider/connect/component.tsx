import Layout from "../layout";
import { t } from "i18next";
import { shortAddress } from "@/shared/utils/transactions";
import { useGetCurrentAccount } from "@/ui/states/walletState";
import { FingerprintIcon } from "@/ui/icons/phosphor";
import s from "./styles.module.scss";

const Connect = () => {
  const currentAccount = useGetCurrentAccount();

  return (
    <Layout
      documentTitle={t("provider.connecting")}
      resolveBtnText={t("provider.connect")}
      resolveBtnClassName="btn primary"
    >
      <div className={`panel ${s.card}`}>
        <div className={s.iconWrap}>
          <FingerprintIcon size={40} />
        </div>
        <h3 className={s.title}>{t("provider.access_required")}</h3>
        <p className={s.sub}>{t("provider.connecting_account") + ":"}</p>
        <div className="chip">
          <b>{shortAddress(currentAccount?.address)}</b>
        </div>
      </div>
    </Layout>
  );
};

export default Connect;
