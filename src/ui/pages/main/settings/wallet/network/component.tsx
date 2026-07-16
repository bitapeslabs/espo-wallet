import { useState } from "react";
import toast from "react-hot-toast";
import { t } from "i18next";
import s from "./styles.module.scss";
import { useAppState } from "@/ui/states/appState";
import { useSwitchNetwork } from "@/ui/hooks/wallet";
import { ss } from "@/ui/utils";
import { NETWORKS, networkSlug } from "@/shared/networks";
import NetworkIcon from "@/ui/components/network-icon";

const NetworkSettings = () => {
  const { network, esploraUrl, updateAppState } = useAppState(
    ss(["network", "esploraUrl", "updateAppState"])
  );
  const switchNetwork = useSwitchNetwork();
  const activeSlug = networkSlug(network);

  const [urls, setUrls] = useState<Record<string, string>>({
    mainnet: esploraUrl?.mainnet ?? "",
    regtest: esploraUrl?.regtest ?? "",
  });

  const saveUrl = async (slug: "mainnet" | "regtest") => {
    await updateAppState({
      esploraUrl: {
        ...esploraUrl,
        [slug]: urls[slug].trim(),
      },
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
            <label>{t("network_settings.esplora_url")}</label>
            <input
              type="text"
              value={urls[i.slug]}
              placeholder={i.esploraUrl}
              onChange={(e) =>
                setUrls((prev) => ({ ...prev, [i.slug]: e.target.value }))
              }
            />
          </div>
          <div className="form-actions">
            <button
              className="btn small"
              onClick={async () => await saveUrl(i.slug)}
            >
              {t("network_settings.save")}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default NetworkSettings;
