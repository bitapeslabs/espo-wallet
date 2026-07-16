import { useAppState } from "@/ui/states/appState";

import {
  LockIcon,
  WalletIcon,
  LinkIcon,
  GlobeIcon,
  SignOutIcon,
} from "@/ui/icons/phosphor";
import Tile from "@/ui/components/tile";
import { TileProps } from "@/ui/components/tile/component";

import { t } from "i18next";
import SettingsLayout from "@/ui/components/settings-layout";
import { ss } from "@/ui/utils";

const ICON_SIZE = 20;

const Settings = () => {
  const { logout } = useAppState(ss(["logout"]));

  const items: TileProps[] = [
    {
      icon: <LockIcon size={ICON_SIZE} />,
      label: t("settings.security_settings"),
      link: "/pages/security",
    },
    {
      icon: <WalletIcon size={ICON_SIZE} />,
      label: t("components.layout.wallet_settings"),
      link: "/pages/wallet-settings",
    },
    {
      icon: <LinkIcon size={ICON_SIZE} />,
      label: t("settings.connected_sites"),
      link: "/pages/connected-sites",
    },
    {
      icon: <GlobeIcon size={ICON_SIZE} />,
      label: t("settings.language"),
      link: "/pages/language",
    },
    {
      icon: <SignOutIcon size={ICON_SIZE} />,
      label: t("settings.logout"),
      onClick: logout,
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

export default Settings;
