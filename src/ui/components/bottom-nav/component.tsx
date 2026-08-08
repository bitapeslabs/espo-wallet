import { FC } from "react";
import cn from "classnames";
import { Link, useLocation } from "react-router-dom";
import { useAppState } from "@/ui/states/appState";
import { useGetCurrentAccount } from "@/ui/states/walletState";
import { useUnreadCount } from "@/ui/utils/local-feed";
import { networkSlug } from "@/shared/networks";
import { ss } from "@/ui/utils";
import {
  ClockBoldIcon,
  ClockFillIcon,
  HouseBoldIcon,
  HouseFillIcon,
  MagnifyingGlassBoldIcon,
  MagnifyingGlassFillIcon,
  SnowflakeBoldIcon,
  SnowflakeFillIcon,
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
  { path: "/unwraps", labelKey: "nav.unwraps", Icon: SnowflakeBoldIcon, IconActive: SnowflakeFillIcon },
  { path: "/search", labelKey: "nav.search", Icon: MagnifyingGlassBoldIcon, IconActive: MagnifyingGlassFillIcon },
];

const BottomNav = () => {
  const location = useLocation();
  const { network } = useAppState(ss(["network"]));
  const currentAccount = useGetCurrentAccount();
  const slug = networkSlug(network);
  const address = currentAccount?.address ?? "";
  const historyUnread = useUnreadCount("history", slug, address);
  const unwrapsUnread = useUnreadCount("unwraps", slug, address);
  const unread: Record<string, number> = {
    "/activity": historyUnread,
    "/unwraps": unwrapsUnread,
  };

  return (
    <nav className={s.nav}>
      {ITEMS.map(({ path, Icon, IconActive }) => {
        const active =
          location.pathname === path ||
          (path === "/home" && location.pathname.startsWith("/asset"));
        const Cmp = active ? IconActive : Icon;
        const count = unread[path] ?? 0;
        return (
          <Link
            key={path}
            to={path}
            className={cn(s.item, { [s.active]: active })}
          >
            <span className={s.iconWrap}>
              <Cmp size={27} />
              {count > 0 ? (
                <span className={s.unread}>{count > 9 ? "9+" : count}</span>
              ) : undefined}
            </span>
          </Link>
        );
      })}
    </nav>
  );
};

export default BottomNav;
