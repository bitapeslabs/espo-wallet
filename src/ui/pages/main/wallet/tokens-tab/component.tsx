import { t } from "i18next";
import { useNavigate } from "react-router-dom";
import { TailSpin } from "react-loading-icons";
import { useAssetManagerContext } from "@/ui/utils/assets-ctx";
import { useAppState } from "@/ui/states/appState";
import { ss } from "@/ui/utils";
import type { IPortfolioAsset } from "@/shared/interfaces/api";
import AssetCard from "@/ui/components/asset-card";
import s from "./styles.module.scss";

/**
 * Token balances in espo's address-page alkane card style, driven entirely by
 * the espo portfolio: BTC first, then alkanes, each with its USD value and 24h
 * change. Until get_portfolio_stats has loaded, a loader shows (never a stale
 * or BTC-only value).
 */
const TokensTab = () => {
  const { network } = useAppState(ss(["network"]));
  const { portfolio, alkanes } = useAssetManagerContext();
  const navigate = useNavigate();

  // Wait for the portfolio so BTC + alkanes (and their USD values) appear
  // together, never a stale/partial or BTC-only list.
  if (portfolio === undefined) {
    return (
      <div className={s.loading}>
        <TailSpin className="animate-spin" />
      </div>
    );
  }

  const btc: IPortfolioAsset = portfolio.btc ?? {
    id: "btc",
    name: t("wallet_page.bitcoin"),
    symbol: "BTC",
    balance: "0",
    priceUsd: null,
    valueUsd: null,
    change24h: null,
    valueChangeUsd24h: null,
  };

  return (
    <div className="io-alkanes">
      <AssetCard
        asset={btc}
        network={network}
        fallbackName={t("wallet_page.bitcoin")}
        onClick={() => navigate("/asset/btc")}
      />
      {alkanes.map((a) => (
        <AssetCard
          key={a.id}
          asset={a}
          network={network}
          onClick={() =>
            navigate(`/asset/${encodeURIComponent(a.id)}`, {
              state: { alkane: a },
            })
          }
        />
      ))}
    </div>
  );
};

export default TokensTab;
