import { GearSixIcon, KeyIcon } from "@/ui/icons/phosphor";
import Tile from "@/ui/components/tile";
import { TileProps } from "@/ui/components/tile/component";

import { t } from "i18next";
import SettingsLayout from "@/ui/components/settings-layout";

const ICON_SIZE = 20;

const Security = () => {
  const items: TileProps[] = [
    {
      icon: <KeyIcon size={ICON_SIZE} />,
      label: t("components.layout.change_password"),
      link: "/pages/change-password",
    },
    {
      icon: <GearSixIcon size={ICON_SIZE} />,
      label: t("components.layout.advanced"),
      link: "/pages/advanced",
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

export default Security;
