import { useState } from "react";
import cn from "classnames";
import { t } from "i18next";
import { useNavigate } from "react-router-dom";
import s from "./styles.module.scss";
import { TailSpin } from "react-loading-icons";
import WalletPanel from "./wallet-panel";
import TokensTab from "./tokens-tab";
import { useGetCurrentAccount } from "@/ui/states/walletState";
import { useAssetManagerContext } from "@/ui/utils/assets-ctx";
import { formatUsd, formatUsdChange } from "@/shared/utils/alkanes";
import SquareAction from "@/ui/components/square-action";
import FitText from "@/ui/components/fit-text";
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
  const { portfolio } = useAssetManagerContext();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("tokens");

  if (!currentAccount) return <TailSpin className="animate-spin" />;

  // The worth is always the portfolio's USD total. Until get_portfolio_stats
  // has loaded for this network (portfolio === undefined) we can't render a USD
  // value, so show a skeleton rather than a BTC amount or a transient number.
  const worthUsd = portfolio?.totalValueUsd;
  const worthChangeUsd = portfolio?.changeUsd24h ?? null;
  const worthChangePct = portfolio?.change24h ?? null;

  return (
    <div className={s.walletDiv}>
      <WalletPanel />

      <div className={s.worth}>
        {worthUsd === undefined ? (
          <div className={s.balanceSkeleton} />
        ) : (
          <>
            <FitText
              className={s.worthValue}
              maxFont={44}
              minFont={18}
              screenMargin={20}
            >
              ${formatUsd(worthUsd)}
            </FitText>
            {worthChangeUsd != null ? (
              <span
                className={cn(s.worthChange, {
                  [s.up]: worthChangeUsd >= 0,
                  [s.down]: worthChangeUsd < 0,
                })}
              >
                {formatUsdChange(worthChangeUsd)}
                {worthChangePct != null
                  ? ` (${worthChangePct >= 0 ? "+" : ""}${worthChangePct.toFixed(
                      2
                    )}%)`
                  : ""}
              </span>
            ) : undefined}
          </>
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
