import { FC } from "react";
import cn from "classnames";
import { Link, useLocation } from "react-router-dom";
import {
  ClockBoldIcon,
  ClockFillIcon,
  HouseBoldIcon,
  HouseFillIcon,
  MagnifyingGlassBoldIcon,
  MagnifyingGlassFillIcon,
  SwapBoldIcon,
  SwapFillIcon,
  IconProps,
} from "@/ui/icons/phosphor";
import s from "./styles.module.scss";

interface NavItem {
  path: string;
  labelKey: string;
  Icon: FC<IconProps>;
  IconActive: FC<IconProps>;
}

const ITEMS: NavItem[] = [
  { path: "/home", labelKey: "nav.home", Icon: HouseBoldIcon, IconActive: HouseFillIcon },
  { path: "/swap", labelKey: "nav.swap", Icon: SwapBoldIcon, IconActive: SwapFillIcon },
  { path: "/activity", labelKey: "nav.activity", Icon: ClockBoldIcon, IconActive: ClockFillIcon },
  { path: "/search", labelKey: "nav.search", Icon: MagnifyingGlassBoldIcon, IconActive: MagnifyingGlassFillIcon },
];

const BottomNav = () => {
  const location = useLocation();

  return (
    <nav className={s.nav}>
      {ITEMS.map(({ path, Icon, IconActive }) => {
        const active =
          location.pathname === path ||
          (path === "/home" && location.pathname.startsWith("/asset"));
        const Cmp = active ? IconActive : Icon;
        return (
          <Link
            key={path}
            to={path}
            className={cn(s.item, { [s.active]: active })}
          >
            <Cmp size={27} />
          </Link>
        );
      })}
    </nav>
  );
};

export default BottomNav;
