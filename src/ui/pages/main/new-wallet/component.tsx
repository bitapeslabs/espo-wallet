import s from "./styles.module.scss";
import { TileProps } from "@/ui/components/tile/component";
import { GlobeIcon, KeyIcon, PlusIcon } from "@/ui/icons/phosphor";
import Tile from "@/ui/components/tile";
import { t } from "i18next";

const NewWallet = () => {
  const items: TileProps[] = [
    {
      icon: <PlusIcon size={20} />,
      label: t("new_wallet.new_mnemonic_label"),
      link: "/pages/new-mnemonic",
    },
    {
      icon: <GlobeIcon size={20} />,
      label: t("new_wallet.restore_mnemonic_label"),
      link: "/pages/restore-mnemonic",
    },
    {
      icon: <KeyIcon size={20} />,
      label: t("new_wallet.restore_from_private_key_label"),
      link: "/pages/restore-priv-key",
    },
  ];
  return (
    <div className={s.container}>
      <div className={s.choice}>
        {items.map((i) => (
          <Tile key={i.label} {...i} />
        ))}
      </div>
    </div>
  );
};

export default NewWallet;
