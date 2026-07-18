import { useEffect, useRef, useState } from "react";
import cn from "classnames";
import { useAppState } from "@/ui/states/appState";
import { useSwitchNetwork } from "@/ui/hooks/wallet";
import { ss } from "@/ui/utils";
import { NETWORKS, networkSlug } from "@/shared/networks";
import NetworkIcon from "@/ui/components/network-icon";
import { CaretDownBoldIcon, CheckIcon } from "@/ui/icons/phosphor";
import s from "./styles.module.scss";

/**
 * Compact network switcher for the wallet navbar. Trigger shows only the
 * active network's roundel; the dropdown rows show the roundel + name.
 * Same espo `.dropdown` component used elsewhere.
 */
const NetworkSwitcher = () => {
  const { network } = useAppState(ss(["network"]));
  const switchNetwork = useSwitchNetwork();
  const activeSlug = networkSlug(network);

  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  return (
    <div
      className={cn("dropdown", s.netDropdown)}
      data-open={open ? "1" : "0"}
      ref={rootRef}
    >
      <button
        type="button"
        className={cn("dropdown-trigger", s.netTrigger)}
        onClick={() => setOpen((p) => !p)}
      >
        <NetworkIcon network={network} size={20} />
        <span className="dropdown-caret">
          <CaretDownBoldIcon size={14} />
        </span>
      </button>
      <div className={cn("dropdown-panel", s.netPanel)}>
        {NETWORKS.map((n) => (
          <button
            type="button"
            key={n.slug}
            className={cn("dropdown-item", {
              selected: n.slug === activeSlug,
            })}
            onClick={async () => {
              setOpen(false);
              if (n.slug !== activeSlug) await switchNetwork(n.network);
            }}
          >
            <NetworkIcon network={n.network} size={18} />
            <span className="dropdown-label">{n.name}</span>
            {n.slug === activeSlug ? (
              <CheckIcon size={13} className={s.check} />
            ) : undefined}
          </button>
        ))}
      </div>
    </div>
  );
};

export default NetworkSwitcher;
