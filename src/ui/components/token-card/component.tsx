import { IToken } from "@/shared/interfaces/token";
import { CaretRightIcon } from "@/ui/icons/phosphor";
import { t } from "i18next";
import { FC, useState } from "react";
import Modal from "../modal";
import { shortAddress } from "@/shared/utils/transactions";
import { nFormatter } from "../../utils/formatter";
import s from "./styles.module.scss";

interface Props {
  token: IToken;
  openMintModal: (token: IToken) => void;
  openSendModal: (token: IToken) => void;
}

const TokenCard: FC<Props> = ({ token, openMintModal, openSendModal }) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div
        className={s.card}
        onClick={() => {
          setOpen(true);
        }}
      >
        <div className={s.cardInfo}>
          <span className={s.tick}>{token.tick.toUpperCase()}</span>
          <div className={s.balances}>
            <div>
              <span>{t("components.token_card.balance")}</span>:{" "}
              <span className={s.num}>{nFormatter(token.balance)}</span>
            </div>
            <div>
              <span>{t("components.token_card.transferable_balance")}</span>:{" "}
              <span className={s.num}>
                {nFormatter(token.transferable_balance)}
              </span>
            </div>
          </div>
        </div>
        <CaretRightIcon size={18} className={s.caret} />
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={token.tick.toUpperCase()}
      >
        <div className={s.modalBody}>
          <div className="review-grid">
            <div className="review-card stat">
              <label htmlFor="token_balance" className="stat-label">
                {t("components.token_card.balance")}
              </label>
              <span id="token_balance" className="stat-value">
                {nFormatter(token.balance)}
              </span>
            </div>
            <div className="review-card stat">
              <label htmlFor="transfer_balance" className="stat-label">
                {t("components.token_card.transferable_balance")}
              </label>
              <span id="transfer_balance" className="stat-value">
                {nFormatter(token.transferable_balance)}
              </span>
            </div>
          </div>

          {token.transfers.length ? (
            <div className={s.transfersWrap}>
              <h3 className={s.transfersHead}>{t("components.token_card.transfers")}</h3>
              <div className={s.transfersList}>
                {token.transfers.map((transfer, i) => (
                  <div key={i} className={s.transferRow}>
                    <span className={s.transferAmount}>
                      {nFormatter(transfer.amount)}
                    </span>
                    <span className={s.transferId}>
                      {shortAddress(transfer.inscription_id, 9)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : undefined}

          <div className={s.actions}>
            <button
              disabled={!token.transfers.length}
              className="btn small"
              onClick={() => {
                openSendModal(token);
                setOpen(false);
              }}
            >
              {t("components.token_card.send")}
            </button>
            <button
              disabled={Number(token.balance) === 0}
              className="btn small ghost"
              onClick={() => {
                openMintModal(token);
                setOpen(false);
              }}
            >
              {t("components.token_card.create_transfer")}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
};

export default TokenCard;
