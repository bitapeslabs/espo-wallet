import { useEffect, useRef, useState } from "react";
import s from "./styles.module.scss";
import CheckPassword from "@/ui/components/check-password";
import { useParams } from "react-router-dom";
import { useControllersState } from "@/ui/states/controllerState";
import { CopyFillIcon } from "@/ui/icons/phosphor";
import cn from "classnames";
import { t } from "i18next";
import { ss } from "@/ui/utils";
import { useGetCurrentWallet } from "@/ui/states/walletState";

const ShowPk = () => {
  const [unlocked, setUnlocked] = useState(false);
  const { accId } = useParams();
  const { keyringController } = useControllersState(ss(["keyringController"]));
  const currentWallet = useGetCurrentWallet();
  const [secret, setSecret] = useState("");

  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(copiedTimer.current), []);

  useEffect(() => {
    // Resolve the account by id (fall back to array index) and export its WIF.
    // Guarded + try/caught so a not-yet-loaded wallet doesn't throw and leave
    // the key blank.
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    (async () => {
      const account =
        currentWallet?.accounts?.find((a) => a.id === Number(accId)) ??
        currentWallet?.accounts?.[Number(accId)];
      if (!account?.address) return;
      try {
        setSecret(await keyringController.exportAccount(account.address));
      } catch (e) {
        console.error(e);
      }
    })();
  }, [keyringController, accId, currentWallet]);

  const onCopy = async () => {
    if (!secret) return;
    await navigator.clipboard.writeText(secret);
    setCopied(true);
    clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), 1000);
  };

  return (
    <div className={s.showPk}>
      {unlocked ? (
        <div className={s.secretGroup}>
          <div className={cn("panel", s.secretCard)}>
            <div className={s.secret}>{secret}</div>
          </div>
          <button className={cn("btn", s.copyBtn)} onClick={onCopy}>
            {copied ? undefined : <CopyFillIcon size={15} />}
            <span>
              {copied ? t("receive.copied") : t("switch_account.show_pk.copy")}
            </span>
          </button>
        </div>
      ) : (
        <CheckPassword
          handler={() => {
            setUnlocked(true);
          }}
        />
      )}
    </div>
  );
};

export default ShowPk;
