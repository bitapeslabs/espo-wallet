import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { t } from "i18next";
import s from "./styles.module.scss";
import Lottie, { type Rgb } from "@/ui/components/lottie";
import { ArrowUpRightBoldIcon } from "@/ui/icons/phosphor";
import checkedAnimation from "@/ui/lotties/checked.json";
import loadingAnimation from "@/ui/lotties/loading.json";
import { usePushBtcTxCallback } from "@/ui/hooks/transactions";
import { useUpdateCurrentAccountBalance } from "@/ui/hooks/wallet";
import { useUpdateAddressBook } from "@/ui/hooks/app";
import { useTransactionManagerContext } from "@/ui/utils/tx-ctx";
import { useGetCurrentAccount } from "@/ui/states/walletState";
import { useAppState } from "@/ui/states/appState";
import { ss } from "@/ui/utils";
import { explorerTxUrl, networkSlug } from "@/shared/networks";
import { browserTabsCreate } from "@/shared/utils/browser";
import type { ActivityKind, IActivityEntry } from "@/shared/interfaces/api";
import { addLocalPendingTx } from "@/ui/utils/local-feed";

/** Both animations render in the same box so there's no jump on success. */
const LOTTIE_SIZE = 140;

/**
 * The check animation fades its circle + tick out between frames 50 and 62, so
 * playing it to the end leaves an empty frame. Stop at 50: the check is fully
 * drawn and the burst effects have already cleared, and it holds there.
 */
const CHECKED_SEGMENT: [number, number] = [0, 50];

/** The check animation's greens -> the app's success green (+ lighter tints). */
const CHECKED_RECOLOR: { from: Rgb; to: Rgb }[] = [
  { from: [19, 152, 89], to: [51, 225, 131] }, // --success
  { from: [166, 211, 181], to: [169, 242, 203] },
  { from: [226, 241, 228], to: [226, 251, 238] },
];

/** The spinner's blue -> --muted, so it reads as a neutral in-progress state. */
const LOADING_RECOLOR: { from: Rgb; to: Rgb }[] = [
  { from: [0, 168, 255], to: [163, 169, 184] }, // --muted
];

/** "{Action} Sent" per activity kind; anything else is a plain transaction. */
function sentTitleKey(kind?: ActivityKind): string {
  switch (kind) {
    case "send":
    case "receive":
      return "send.finalle_send.transfer_sent";
    case "buy":
    case "sell":
      return "send.finalle_send.swap_sent";
    case "wrap":
      return "send.finalle_send.wrap_sent";
    case "unwrap":
      return "send.finalle_send.unwrap_sent";
    default:
      return "send.finalle_send.transaction_sent";
  }
}

/**
 * Broadcast result screen (no header): the muted loading animation while the tx
 * is being broadcast, then the green check with the action title, an explorer
 * link, and a close button.
 */
const FinalleSend = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const pushTx = usePushBtcTxCallback();
  const updateBalance = useUpdateCurrentAccountBalance();
  const updateAddressBook = useUpdateAddressBook();
  const { updateTransactions } = useTransactionManagerContext();
  const currentAccount = useGetCurrentAccount();
  const { network, explorerUrl } = useAppState(ss(["network", "explorerUrl"]));

  const [txid, setTxid] = useState<string | undefined>(location.state?.txid);
  const broadcast = useRef(false);

  const kind = location.state?.kind as ActivityKind | undefined;

  // One tx, or a CPFP package: the parent MUST be broadcast before the child,
  // since the child spends the parent's (still unconfirmed) output.
  const hexes = useMemo(() => {
    const many = location.state?.hexes as string[] | undefined;
    if (many?.length) return many;
    const one = location.state?.hex as string | undefined;
    return one ? [one] : [];
  }, [location.state?.hexes, location.state?.hex]);

  // Broadcast once on mount; the loader shows until a txid comes back.
  useEffect(() => {
    if (broadcast.current || !hexes.length || txid) return;
    broadcast.current = true;
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    (async () => {
      try {
        // Entries supplied by the review flow, aligned with `hexes`: the tx
        // shapes are known pre-broadcast, so each lands in the local feed the
        // moment its txid comes back (visible before espo indexes it).
        const optimistic = (location.state?.optimistic ??
          []) as Omit<IActivityEntry, "txid">[];
        let last: string | undefined;
        for (const [i, raw] of hexes.entries()) {
          const data = await pushTx(raw);
          if (!data || !data.txid) {
            throw new Error(data?.error ?? "Failed pushing transaction");
          }
          last = data.txid;
          if (optimistic[i] && currentAccount?.address) {
            addLocalPendingTx(
              networkSlug(network),
              currentAccount.address,
              { ...optimistic[i], txid: data.txid },
              raw
            );
          }
        }
        // The last tx is the one that completes the action (the CPFP child),
        // so it's what "View Transaction" should open.
        setTxid(last);

        setTimeout(() => {
          updateBalance().catch(console.error);
          if (currentAccount?.address) {
            updateTransactions(currentAccount.address).catch(console.error);
          }
        }, 100);

        if (location.state?.save && location.state?.toAddress) {
          await updateAddressBook(location.state.toAddress);
        }
      } catch (e) {
        toast.error((e as Error).message);
        console.error(e);
        navigate(-1);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hexes]);

  const onViewTransaction = () => {
    if (!txid) return;
    browserTabsCreate({
      url: explorerTxUrl(network, txid, explorerUrl?.[networkSlug(network)]),
      active: true,
    }).catch(console.error);
  };

  return (
    <div className={s.page}>
      <div className={s.center}>
        {txid ? (
          <Lottie
            animationData={checkedAnimation}
            recolor={CHECKED_RECOLOR}
            segment={CHECKED_SEGMENT}
            size={LOTTIE_SIZE}
          />
        ) : (
          <Lottie
            animationData={loadingAnimation}
            recolor={LOADING_RECOLOR}
            loop
            size={LOTTIE_SIZE}
          />
        )}

        {txid ? (
          <>
            <span className={s.title}>{t(sentTitleKey(kind))}</span>
            <a
              className="link"
              href="#"
              onClick={(e) => {
                e.preventDefault();
                onViewTransaction();
              }}
            >
              {t("send.finalle_send.view_transaction")}
              <ArrowUpRightBoldIcon size={14} className={s.linkArrow} />
            </a>
          </>
        ) : undefined}
      </div>

      <button className="bottom-btn" onClick={() => navigate("/home")}>
        {t("send.finalle_send.close")}
      </button>
    </div>
  );
};

export default FinalleSend;
