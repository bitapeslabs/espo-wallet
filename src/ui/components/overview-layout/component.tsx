import { FC } from "react";
import type { Network } from "bitcoinjs-lib";
import s from "./styles.module.scss";
import type { IActivityEntry } from "@/shared/interfaces/api";
import TransactionOverview from "@/ui/components/transaction-overview";
import ActivityIcon from "@/ui/pages/main/activity/activity-icon";
import FitText from "@/ui/components/fit-text";
import { ArrowUpRightBoldIcon } from "@/ui/icons/phosphor";

interface Props {
  /** Classified entry driving the header icon + status badge. */
  entry: IActivityEntry;
  network: Network;
  /** Action name shown under the icon, e.g. "Transfer 5.67 DIESEL". */
  headerName: string;
  /** Symbol resolver for the icon. */
  sym: (id: string) => string;

  /** Transaction source: pre-broadcast raw hex, or a confirmed/pending txid. */
  rawTx?: string;
  /**
   * A package of raw transactions reviewed together (e.g. a CPFP parent +
   * child). 2+ entries add a segmented control to the overview card; a single
   * entry renders like `rawTx`.
   */
  rawTxs?: { hex: string; label?: string }[];
  /** Unbroadcast ancestor candidates for `rawTx` (see TransactionOverview). */
  chainRawTxs?: string[];
  txid?: string;
  fromAddress?: string;
  feeRate?: number;

  /** The consumer-provided bottom action (Confirm / View on Espo / …). */
  actionLabel: string;
  onAction: () => void;
  actionDisabled?: boolean;
  /** The action opens an external page: an outward arrow precedes the label. */
  actionExternal?: boolean;
}

/**
 * Reusable transaction overview page: the activity-style header (icon + status
 * circle, action name below), the espo-faithful inputs/outputs/OP_RETURN card,
 * and an action button whose label + behavior are supplied by the consumer
 * (Confirm submits a tx; the activity view opens espo; etc.). The card itself is
 * agnostic to the action taken.
 */
const OverviewLayout: FC<Props> = ({
  entry,
  network,
  headerName,
  sym,
  rawTx,
  rawTxs,
  chainRawTxs,
  txid,
  fromAddress,
  feeRate,
  actionLabel,
  onAction,
  actionDisabled,
  actionExternal,
}) => (
  <div className={s.wrapper}>
    <div className={s.overviewHead}>
      <span className={s.overviewIcon}>
        <ActivityIcon entry={entry} network={network} sym={sym} />
      </span>
      <FitText
        className={s.overviewKind}
        maxFont={18}
        minFont={12}
        screenMargin={24}
      >
        {headerName}
      </FitText>
    </div>

    <TransactionOverview
      rawTx={rawTx}
      rawTxs={rawTxs}
      chainRawTxs={chainRawTxs}
      txid={txid}
      network={network}
      fromAddress={fromAddress}
      feeRate={feeRate}
    />

    <button
      disabled={actionDisabled}
      className="bottom-btn"
      onClick={onAction}
    >
      {actionExternal ? (
        <span className={s.externalAction}>
          {actionLabel}
          <ArrowUpRightBoldIcon size={16} />
        </span>
      ) : (
        actionLabel
      )}
    </button>
  </div>
);

export default OverviewLayout;
