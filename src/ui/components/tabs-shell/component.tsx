import { useEffect, useRef } from "react";
import { Outlet, useLocation } from "react-router-dom";
import BottomNav from "../bottom-nav";
import WalletPanel from "@/ui/pages/main/wallet/wallet-panel";
import s from "./styles.module.scss";

/** Layout for the main tab pages: the wallet top bar, routed content, navbar. */
const TabsShell = () => {
  const { pathname } = useLocation();
  const contentRef = useRef<HTMLDivElement>(null);

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
