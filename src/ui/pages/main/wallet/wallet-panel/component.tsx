import s from "../styles.module.scss";
import cn from "classnames";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useGetCurrentAccount } from "@/ui/states/walletState";
import { shortAddress } from "@/shared/utils/transactions";
import {
  chromeApi,
  getSidebarMode,
  setSidebarMode,
  sidebarSupported,
} from "@/shared/utils/sidebar";
import CopyBtn from "@/ui/components/copy-btn";
import NetworkSwitcher from "@/ui/components/network-switcher";
import {
  CaretRightBoldIcon,
  GearSixFillIcon,
  SidebarSimpleBoldIcon,
} from "@/ui/icons/phosphor";

const WalletPanel = () => {
  const currentAccount = useGetCurrentAccount();
  const navigate = useNavigate();

  const [sidebar, setSidebar] = useState(false);
  const winIdRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!sidebarSupported()) return;
    getSidebarMode()
      .then(setSidebar)
      .catch(() => undefined);
    // Preload the window id so open() can run inside the click gesture.
    chromeApi?.windows
      ?.getCurrent?.()
      .then((w) => (winIdRef.current = w?.id))
      .catch(() => undefined);
  }, []);

  const toggleSidebar = () => {
    const next = !sidebar;
    setSidebar(next);
    if (next) {
      // Open the side panel synchronously within the gesture, persist, then
      // close the popup we're in.
      if (winIdRef.current != null) {
        chromeApi?.sidePanel
          ?.open({ windowId: winIdRef.current })
          .catch(() => undefined);
      }
      setSidebarMode(true)
        .catch(console.error)
        .finally(() => window.close());
    } else {
      // Persist + restore the popup behaviour, then leave the side panel.
      setSidebarMode(false)
        .catch(console.error)
        .finally(() => window.close());
    }
  };

  return (
    <div className={s.topBar}>
      <div className={s.walletLeft}>
        <NetworkSwitcher />
        <div
          className={s.walletWidget}
          onClick={() => navigate("/manage-wallets")}
        >
          <div className={s.walletMeta}>
            <span className={s.walletName}>
              {currentAccount?.name ?? "Account"}
            </span>
            <span className={s.walletAddr}>
              {shortAddress(currentAccount?.address, 6)}
              <span
                className={s.walletCopyWrap}
                onClick={(e) => e.stopPropagation()}
              >
                <CopyBtn
                  value={currentAccount?.address}
                  className={s.walletCopy}
                />
              </span>
            </span>
          </div>
          <CaretRightBoldIcon size={14} className={s.walletCaret} />
        </div>
      </div>

      <div className={s.topRight}>
        {sidebarSupported() ? (
          <button
            type="button"
            className={cn(s.topAction, { [s.topActionActive]: sidebar })}
            onClick={toggleSidebar}
          >
            <SidebarSimpleBoldIcon size={19} />
          </button>
        ) : null}
        <Link to={"/pages/settings"} className={s.topAction}>
          <GearSixFillIcon size={19} />
        </Link>
      </div>
    </div>
  );
};

export default WalletPanel;
