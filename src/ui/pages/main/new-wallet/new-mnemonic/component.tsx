import { useCallback, useEffect, useState } from "react";
import s from "./styles.module.scss";
import { TailSpin } from "react-loading-icons";
import { useLocation, useNavigate } from "react-router-dom";
import { useControllersState } from "@/ui/states/controllerState";
import { useCreateNewWallet } from "@/ui/hooks/wallet";
import cn from "classnames";
import { useAppState } from "@/ui/states/appState";
import toast from "react-hot-toast";
import SwitchAddressType from "@/ui/components/switch-address-type";
import { t } from "i18next";
import { AddressType } from "@/background/services/keyring/hdw";
import Switch from "@/ui/components/switch";
import Breadcrumbs from "@/ui/components/breadcrumbs";
import { useWalletState } from "@/ui/states/walletState";
import { ss } from "@/ui/utils";
import { ADDRESS_TYPES } from "@/shared/constant";

const NewMnemonic = () => {
  const location = useLocation();

  const [step, setStep] = useState(1);
  const { wallets } = useWalletState(ss(["wallets"]));
  const onboarding = wallets.length === 0;
  const crumbSteps = [
    ...(onboarding ? [t("components.breadcrumbs.password")] : []),
    t("components.breadcrumbs.recovery_phrase"),
    t("components.breadcrumbs.preferences"),
  ];
  const crumbCurrent = (onboarding ? 1 : 0) + (step - 1);
  const [loading, setLoading] = useState(false);
  const [savedPhrase, setSavedPhrase] = useState(false);
  const { updateAppState, network } = useAppState(
    ss(["updateAppState", "network"])
  );
  const { walletController, stateController } = useControllersState(
    ss(["walletController", "stateController"])
  );
  const [mnemonicPhrase, setMnemonicPhrase] = useState<string | undefined>(
    undefined
  );
  const [addressType, setAddressType] = useState<AddressType>(
    ADDRESS_TYPES[0].value
  );

  const createNewWallet = useCreateNewWallet();

  const init = useCallback(async () => {
    if (location.state?.pending) {
      return setMnemonicPhrase(location.state.pending);
    }

    const phrase = await walletController.generateMnemonicPhrase();
    await updateAppState({
      pendingWallet: phrase,
    });
    setMnemonicPhrase(phrase);
  }, [updateAppState, walletController, location.state?.pending]);

  useEffect(() => {
    if (mnemonicPhrase) return;
    init().catch((e) => {
      if ((e as Error).message) toast.error((e as Error).message);
    });
  }, [mnemonicPhrase, init]);

  const navigate = useNavigate();

  const onCreate = async () => {
    if (!mnemonicPhrase) {
      toast.error(t("new_wallet.new_mnemonic.error_phrase_blank"));
      return;
    }
    setLoading(true);
    try {
      await stateController.clearPendingWallet();
      await createNewWallet({
        payload: mnemonicPhrase,
        walletType: "root",
        addressType,
        hideRoot: true,
        network,
      });
    } catch (e) {
      const error = e as Error;
      if ("message" in error) {
        toast.error(error.message);
      } else {
        console.error(e);
      }
    }
    setLoading(false);
    navigate("/");
  };

  const onSwitch = () => {
    setSavedPhrase((p) => !p);
  };

  if (!mnemonicPhrase || loading) {
    return <TailSpin className="animate-spin" />;
  }

  return (
    <div className={s.newMnemonic}>
      <Breadcrumbs steps={crumbSteps} current={crumbCurrent} className={s.crumbs} />
      {step === 1 ? (
        <div className={s.step}>
          <div className={s.stepBody}>
            <p className={cn("inline-notice", s.warning)}>
              {t("new_wallet.new_mnemonic.warning")}
            </p>
            <div className={s.phrase}>
              {mnemonicPhrase.split(" ").map((word, index) => (
                <div key={index} className={s.word}>
                  <span className={s.wordNum}>{index + 1}</span>
                  <span className={s.wordText}>{word}</span>
                </div>
              ))}
            </div>
            <Switch
              label={t("new_wallet.new_mnemonic.i_saved_this_phrase")}
              onChange={onSwitch}
              value={savedPhrase}
              className={s.savePhrase}
            />
          </div>
          <div>
            <button
              className="bottom-btn"
              onClick={() => setStep(2)}
              disabled={!savedPhrase}
            >
              {t("new_wallet.continue")}
            </button>
          </div>
        </div>
      ) : (
        <div className={s.step}>
          <div className={s.stepBody}>
            <SwitchAddressType
              handler={setAddressType}
              selectedType={addressType}
            />
          </div>
          <div>
            <button onClick={onCreate} className="bottom-btn">
              {t("new_wallet.continue")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default NewMnemonic;
