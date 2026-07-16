import { FC, useState } from "react";
import s from "./styles.module.scss";
import { XIcon, ListIcon } from "@/ui/icons/phosphor";

import Menu from "@/ui/components/menu";
import cn from "classnames";
import { MenuItem } from "../menu/components";
import { t } from "i18next";

interface Props {
  menuItems: MenuItem[];
  id: number;
  selected: boolean;
  name: string;
  onClick: () => void;
  address?: string;
  isRoot?: boolean;
}

const Card: FC<Props> = ({
  menuItems,
  selected,
  onClick,
  name,
  address,
  id,
  isRoot,
}) => {
  const [active, setActive] = useState(false);

  const onMenuClick: React.MouseEventHandler<HTMLButtonElement> = (e) => {
    e.stopPropagation();
    setActive(true);
  };

  return (
    <div
      id={String(id)}
      className={cn(s.card, { [s.selected]: selected })}
      onClick={onClick}
    >
      <div className={s.wrapper}>
        <div className={s.name}>
          <span className={cn("dot", { on: selected })} />
          {isRoot ? t("components.card.root_account") : name}
        </div>
        <div className={s.right}>
          {address ? <div className={s.address}>{address}</div> : undefined}
          <button className={s.action} onClick={onMenuClick}>
            <ListIcon size={20} />
          </button>
        </div>
      </div>
      <Menu
        active={active}
        items={[
          ...menuItems.map((i) => ({
            ...i,
            action: () => {
              if (i.action) i.action();
              setActive(false);
            },
          })),
          {
            action: () => {
              setActive(false);
            },
            icon: <XIcon title={t("components.card.close")} size={20} />,
          },
        ]}
      />
    </div>
  );
};

export default Card;
