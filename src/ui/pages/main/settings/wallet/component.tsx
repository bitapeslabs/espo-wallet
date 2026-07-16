import { browserTabsCreate } from "@/shared/utils/browser";

import Tile from "@/ui/components/tile";
import { TileProps } from "@/ui/components/tile/component";

import { t } from "i18next";
import {
  ArrowUpRightIcon,
  GlobeIcon,
  UserIcon,
  WalletIcon,
} from "@/ui/icons/phosphor";
import SettingsLayout from "@/ui/components/settings-layout";

const ICON_SIZE = 20;

const WalletSettings = () => {
  const expandView = async () => {
    await browserTabsCreate({
      url: "index.html",
    });
  };

  const items: TileProps[] = [
    {
      icon: <WalletIcon size={ICON_SIZE} />,
      label: t("settings.wallets"),
      link: "/manage-wallets",
    },
    {
      icon: <GlobeIcon size={ICON_SIZE} />,
      label: t("components.layout.network_settings"),
      link: "/pages/network-settings",
    },
    {
      icon: <UserIcon size={ICON_SIZE} />,
      label: t("settings.address_type"),
      link: "/pages/change-addr-type",
    },
    {
      icon: <ArrowUpRightIcon size={ICON_SIZE} />,
      label: t("settings.expand_view"),
      onClick: expandView,
    },
  ];

  return (
    <SettingsLayout>
      {items.map((i) => (
        <Tile key={i.label} {...i} />
      ))}
    </SettingsLayout>
  );
};

export default WalletSettings;
