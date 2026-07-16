import { useState } from "react";
import cn from "classnames";
import { t } from "i18next";
import { useNavigate } from "react-router-dom";
import s from "./styles.module.scss";
import { TailSpin } from "react-loading-icons";
import WalletPanel from "./wallet-panel";
import TokensTab from "./tokens-tab";
import { useGetCurrentAccount } from "@/ui/states/walletState";
import { useAppState } from "@/ui/states/appState";
import { useTransactionManagerContext } from "@/ui/utils/tx-ctx";
import { calcBalanceLength, ss } from "@/ui/utils";
import { networkInfo } from "@/shared/networks";
import SquareAction from "@/ui/components/square-action";
import {
  PaperPlaneTiltBoldIcon,
  PaperPlaneTiltFillIcon,
  QrCodeBoldIcon,
  QrCodeFillIcon,
  SwapBoldIcon,
  SwapFillIcon,
} from "@/ui/icons/phosphor";

type Tab = "tokens" | "collectibles";

const Wallet = () => {
  const currentAccount = useGetCurrentAccount();
  const { network } = useAppState(ss(["network"]));
  const { currentPrice } = useTransactionManagerContext();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("tokens");

  if (!currentAccount) return <TailSpin className="animate-spin" />;

  const balance = (currentAccount.balance ?? 0) / 10 ** 8;
  const priceCapable = networkInfo(network).hasPrice;
  const loading =
    currentAccount.balance === undefined ||
    (priceCapable && currentPrice === undefined);

  return (
    <div className={s.walletDiv}>
      <WalletPanel />

      <div className={s.worth}>
        {loading ? (
          <div className={s.balanceSkeleton} />
        ) : priceCapable ? (
          <span className={s.worthValue}>
            ${(balance * currentPrice!).toFixed(2)}
          </span>
        ) : (
          <span className={s.worthValue}>
            {calcBalanceLength(balance)} <span className={s.worthUnit}>BTC</span>
          </span>
        )}
      </div>

      <div className={s.squareActions}>
        <SquareAction
          to={"/pages/create-send"}
          icon={<PaperPlaneTiltBoldIcon size={26} />}
          iconHover={<PaperPlaneTiltFillIcon size={26} />}
          label={t("wallet_page.send")}
        />
        <SquareAction
          onClick={() => navigate("/swap")}
          icon={<SwapBoldIcon size={26} />}
          iconHover={<SwapFillIcon size={26} />}
          label={t("nav.swap")}
        />
        <SquareAction
          to={"/pages/receive"}
          icon={<QrCodeBoldIcon size={26} />}
          iconHover={<QrCodeFillIcon size={26} />}
          label={t("wallet_page.receive")}
        />
      </div>

      <div className={s.tabSwitch}>
        <button
          className={cn(s.tabLabel, { [s.tabLabelActive]: tab === "tokens" })}
          onClick={() => setTab("tokens")}
        >
          {t("wallet_page.tokens")}
        </button>
        <button
          className={cn(s.tabLabel, {
            [s.tabLabelActive]: tab === "collectibles",
          })}
          onClick={() => setTab("collectibles")}
        >
          {t("wallet_page.collectibles")}
        </button>
      </div>

      {tab === "tokens" ? <TokensTab /> : <div className={s.collectibles} />}
    </div>
  );
};

export default Wallet;
