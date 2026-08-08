import { useEffect, useRef } from "react";
import { Outlet, useLocation } from "react-router-dom";
import BottomNav from "../bottom-nav";
import WalletPanel from "@/ui/pages/main/wallet/wallet-panel";
import { useActivityFeed, useUnwraps } from "@/ui/utils/feeds";
import { syncUnread } from "@/ui/utils/local-feed";
import { useAppState } from "@/ui/states/appState";
import { useGetCurrentAccount } from "@/ui/states/walletState";
import { networkSlug } from "@/shared/networks";
import { ss } from "@/ui/utils";
import s from "./styles.module.scss";

/** Layout for the main tab pages: the wallet top bar, routed content, navbar. */
const TabsShell = () => {
  const { pathname } = useLocation();
  const contentRef = useRef<HTMLDivElement>(null);

  // Unread bookkeeping: the shell watches both feeds (shared caches, so this
  // costs nothing extra) on EVERY tab. Never-seen txids bump a tab's unread
  // counter; being on the tab marks everything seen and clears it.
  const { network } = useAppState(ss(["network"]));
  const currentAccount = useGetCurrentAccount();
  const address = currentAccount?.address;
  const slug = networkSlug(network);
  const { entries } = useActivityFeed();
  const { rows } = useUnwraps();

  useEffect(() => {
    if (!address || entries === undefined) return;
    syncUnread(
      "history",
      slug,
      address,
      entries.map((e) => e.txid),
      pathname === "/activity"
    );
  }, [entries, pathname, slug, address]);

  useEffect(() => {
    if (!address || rows === undefined) return;
    syncUnread(
      "unwraps",
      slug,
      address,
      rows.map((r) => r.txid),
      pathname === "/unwraps"
    );
  }, [rows, pathname, slug, address]);

  // Every navigation starts at the top; never inherit the previous page's
  // scroll (the content container persists across route changes).
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
    window.scrollTo(0, 0);
  }, [pathname]);

  // The asset detail page has its own back header; every other tab keeps the
  // wallet top bar (network dropdown + account switch + settings).
  const showTopBar = !pathname.startsWith("/asset");

  return (
    <div className={s.shell}>
      {showTopBar ? <WalletPanel /> : null}
      <div className={s.content} ref={contentRef}>
        <Outlet />
      </div>
      <BottomNav />
    </div>
  );
};

export default TabsShell;
