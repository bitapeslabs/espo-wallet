import { useEffect } from "react";
import { t } from "i18next";
import { useNavigate } from "react-router-dom";
import { useInscriptionManagerContext } from "@/ui/utils/inscriptions-ctx";
import { useGetCurrentAccount } from "@/ui/states/walletState";
import { useAppState } from "@/ui/states/appState";
import { useTransactionManagerContext } from "@/ui/utils/tx-ctx";
import { ss } from "@/ui/utils";
import { networkInfo } from "@/shared/networks";
import NetworkIcon from "@/ui/components/network-icon";
import s from "./styles.module.scss";

/**
 * Token balances in espo's address-page alkane card style. BTC is always the
 * first asset; alkane entries follow once an indexer feeds the context.
 */
const TokensTab = () => {
  const currentAccount = useGetCurrentAccount();
  const { network } = useAppState(ss(["network"]));
  const { currentPrice } = useTransactionManagerContext();
  const { tokens, updateTokens } = useInscriptionManagerContext();
  const navigate = useNavigate();

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    updateTokens();
  }, [updateTokens, currentAccount?.address]);

  const balance = (currentAccount?.balance ?? 0) / 10 ** 8;
  const btcBalance = balance.toFixed(8);
  const hasPrice = networkInfo(network).hasPrice && currentPrice !== undefined;

  return (
    <div className="io-alkanes">
      <div
        className={`alk-card ${s.clickable}`}
        onClick={() => navigate("/asset/btc")}
      >
        <div className="alk-line">
          <div className="alk-icon-wrap" aria-hidden="true">
            <NetworkIcon network={network} size={28} />
          </div>
          <div className={s.assetMain}>
            <span className={s.assetName}>{t("wallet_page.bitcoin")}</span>
            <span className={s.assetAmount}>
              <span className="alk-amt">{btcBalance}</span>
              <span className="alk-sym">BTC</span>
            </span>
          </div>
          {hasPrice ? (
            <span className={s.assetUsd}>
              ${(balance * currentPrice!).toFixed(2)}
            </span>
          ) : undefined}
        </div>
      </div>

      {tokens.map((token) => (
        <div
          className={`alk-card ${s.clickable}`}
          key={token.tick}
          onClick={() =>
            navigate(`/asset/${encodeURIComponent(token.tick)}`, {
              state: {
                name: token.tick,
                balance: token.balance,
                symbol: token.tick,
              },
            })
          }
        >
          <div className="alk-line">
            <div className="alk-icon-wrap" aria-hidden="true">
              <span className="alk-icon-letter">{token.tick.slice(0, 1)}</span>
            </div>
            <div className={s.assetMain}>
              <span className={s.assetName}>{token.tick}</span>
              <span className={s.assetAmount}>
                <span className="alk-amt">{token.balance}</span>
                <span className="alk-sym">{token.tick}</span>
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default TokensTab;
