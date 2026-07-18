import { useState } from "react";
import toast from "react-hot-toast";
import { t } from "i18next";
import s from "./styles.module.scss";
import { useAppState } from "@/ui/states/appState";
import { useSwitchNetwork } from "@/ui/hooks/wallet";
import { ss } from "@/ui/utils";
import { NETWORKS, networkSlug, NetworkSlug } from "@/shared/networks";
import NetworkIcon from "@/ui/components/network-icon";

const NetworkSettings = () => {
  const { network, rpcUrl, explorerUrl, updateAppState } = useAppState(
    ss(["network", "rpcUrl", "explorerUrl", "updateAppState"])
  );
  const switchNetwork = useSwitchNetwork();
  const activeSlug = networkSlug(network);

  const [rpcUrls, setRpcUrls] = useState<Record<string, string>>({
    mainnet: rpcUrl?.mainnet ?? "",
    regtest: rpcUrl?.regtest ?? "",
  });
  const [explorerUrls, setExplorerUrls] = useState<Record<string, string>>({
    mainnet: explorerUrl?.mainnet ?? "",
    regtest: explorerUrl?.regtest ?? "",
  });

  const save = async (slug: NetworkSlug) => {
    await updateAppState({
      rpcUrl: { ...rpcUrl, [slug]: rpcUrls[slug].trim() },
      explorerUrl: { ...explorerUrl, [slug]: explorerUrls[slug].trim() },
    });
    toast.success(t("network_settings.saved"));
  };

  return (
    <div className={s.networks}>
      {NETWORKS.map((i) => (
        <div key={i.slug} className="panel">
          <button
            className={`net-row ${activeSlug === i.slug ? "active" : ""}`}
            onClick={async () => {
              if (activeSlug !== i.slug) await switchNetwork(i.network);
            }}
          >
            <NetworkIcon network={i.network} size={22} />
            <span className="net-row-name">{i.name}</span>
            <span className={`dot ${activeSlug === i.slug ? "on" : ""}`} />
          </button>

          <div className="field">
            <label>{t("network_settings.rpc_url")}</label>
            <input
              type="text"
              value={rpcUrls[i.slug]}
              placeholder={i.rpcUrl}
              onChange={(e) =>
                setRpcUrls((prev) => ({ ...prev, [i.slug]: e.target.value }))
              }
            />
          </div>
          <div className="field">
            <label>{t("network_settings.explorer_url")}</label>
            <input
              type="text"
              value={explorerUrls[i.slug]}
              placeholder={i.explorerUrl}
              onChange={(e) =>
                setExplorerUrls((prev) => ({
                  ...prev,
                  [i.slug]: e.target.value,
                }))
              }
            />
          </div>
          <div className="form-actions">
            <button className="btn small" onClick={async () => await save(i.slug)}>
              {t("network_settings.save")}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default NetworkSettings;
