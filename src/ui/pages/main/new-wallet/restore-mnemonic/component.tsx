import s from "./styles.module.scss";
import { useCreateNewWallet } from "@/ui/hooks/wallet";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import SwitchAddressType from "@/ui/components/switch-address-type";
import SelectWithHint from "@/ui/components/select-hint/component";
import { t } from "i18next";
import { useWalletState } from "@/ui/states/walletState";
import Breadcrumbs from "@/ui/components/breadcrumbs";
import { TailSpin } from "react-loading-icons";
import Switch from "@/ui/components/switch";
import { useAppState } from "@/ui/states/appState";
import { ss } from "@/ui/utils";
import {
  ADDRESS_TYPES,
  DEFAULT_HD_PATH,
  hdPathForAddressType,
} from "@/shared/constant";
import { AddressType } from "@/background/services/keyring/hdw";
import Select from "@/ui/components/select";
import { isValidMnemonic } from "@/shared/validators";

const selectOptions = [
  {
    label: "Default",
    value: DEFAULT_HD_PATH,
    lecacyDerivation: false,
    passphrase: "",
  },
  {
    label: "Ordinals",
    value: "m/44'/3'/0'/0/0",
    lecacyDerivation: true,
    isLegacySwitchLocked: true,
    passphrase: "",
  },
  {
    label: "Custom",
    value: "",
  },
];

const RestoreMnemonic = () => {
  const [step, setStep] = useState(1);
  const { wallets } = useWalletState(ss(["wallets"]));
  const onboarding = wallets.length === 0;
  const crumbSteps = [
    ...(onboarding ? [t("components.breadcrumbs.password")] : []),
    t("components.breadcrumbs.import_phrase"),
    t("components.breadcrumbs.preferences"),
  ];
  const crumbCurrent = (onboarding ? 1 : 0) + (step - 1);
  const [addressType, setAddressType] = useState(ADDRESS_TYPES[0].value);
  const [hdPath, setHdPath] = useState<string | undefined>(DEFAULT_HD_PATH);
  const [passphrase, setPassphrase] = useState(
    selectOptions[0].passphrase ?? ""
  );
  const [mnemonicPhrase, setMnemonicPhrase] = useState<(string | undefined)[]>(
    new Array(12).fill("")
  );
  const createNewWallet = useCreateNewWallet();
  const navigate = useNavigate();
  const [loading, setLoading] = useState<boolean>(false);
  const [showRootAcc, setShowRootAcc] = useState<boolean>(false);
  const { network } = useAppState(ss(["network"]));

  const setMnemonic = (v: string, index: number) => {
    const phrase = v.trim().split(/\s+/);
    if (phrase.length === 12) {
      setMnemonicPhrase(phrase);
      return;
    }
    setMnemonicPhrase((prev) => {
      const next = [...prev];
      next[index] = v;
      return next;
    });
  };

  // Selecting an address type moves the derivation path to that type's
  // canonical BIP path (taproot -> m/86', etc.) so it never derives on the
  // segwit path. The user can still override via the Custom path option.
  const onSelectAddressType = (type: AddressType) => {
    setAddressType(type);
    setHdPath(hdPathForAddressType(type));
  };

  const phraseValid = isValidMnemonic(mnemonicPhrase);

  const onNextStep = () => {
    if (!phraseValid)
      return toast.error(
        t("new_wallet.restore_mnemonic.incomplete_phrase_error")
      );
    setStep(2);
  };

  const onRestore = async () => {
    setLoading(true);
    try {
      await createNewWallet({
        payload: mnemonicPhrase.join(" "),
        walletType: "root",
        addressType,
        hideRoot: !showRootAcc,
        network,
        hdPath,
        passphrase,
      });
      navigate("/home");
    } catch (e) {
      console.error(e);
      toast.error(t("new_wallet.restore_mnemonic.invalid_words_error"));
      setStep(1);
    } finally {
      setLoading(false);
    }
  };

  const selectedOption = useMemo(() => {
    const v = selectOptions.find((i) => i.value === hdPath)?.label;

    if (v) return { name: v };

    return { name: selectOptions[selectOptions.length - 1].label };
  }, [hdPath]);

  if (loading) return <TailSpin className="animate-spin" />;

  return (
    <div className={s.restoreMnemonic}>
      <Breadcrumbs steps={crumbSteps} current={crumbCurrent} className={s.crumbs} />
      {step === 1 ? (
        <div className={s.step}>
          <div className={s.stepBody}>
            <div className={s.phrase}>
              {new Array(12).fill("").map((_, index) => (
                <div key={index} className={s.word}>
                  <span className={s.wordIndex}>{index + 1}</span>
                  <SelectWithHint
                    selected={mnemonicPhrase[index]}
                    setSelected={(v) => setMnemonic(v, index)}
                    inputId={`mnemonic-word-${index}`}
                    nextInputId={
                      index < 11 ? `mnemonic-word-${index + 1}` : undefined
                    }
                    nextHasText={index < 11 && !!mnemonicPhrase[index + 1]}
                  />
                </div>
              ))}
            </div>
          </div>
          <div>
            <button
              className="bottom-btn"
              onClick={onNextStep}
              disabled={!phraseValid}
            >
              {t("new_wallet.continue")}
            </button>
          </div>
        </div>
      ) : (
        <div className={s.step}>
          <div className={s.stepBody}>
            <SwitchAddressType
              handler={onSelectAddressType}
              selectedType={addressType}
            />

            <div className={s.pathBlock}>
              <div className={s.pathRow}>
                <input
                  type="text"
                  disabled={selectedOption.name !== "Custom"}
                  className={s.pathInput}
                  placeholder={t("new_wallet.hd_path")}
                  value={hdPath ?? ""}
                  onChange={(e) =>
                    e.target.value.length
                      ? setHdPath(e.target.value)
                      : setHdPath(undefined)
                  }
                />
                <Select
                  anchor="top"
                  selected={selectedOption}
                  setSelected={({ name }) => {
                    const v = selectOptions.find((i) => i.label === name);

                    if (typeof v !== "undefined") {
                      if (v.lecacyDerivation) {
                        setShowRootAcc(true);
                      } else if (v.lecacyDerivation === false) {
                        setShowRootAcc(false);
                      }
                      setHdPath(v.value);
                      setPassphrase(v.passphrase ?? "");
                    }
                  }}
                  values={selectOptions.map((i) => ({
                    name: i.label,
                  }))}
                  className={s.pathSelect}
                />
              </div>

              <input
                type="text"
                disabled={selectedOption.name !== "Custom"}
                className={s.pathInput}
                placeholder={t("new_wallet.passphrase")}
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
              />
            </div>

            <Switch
              label={t("new_wallet.restore_mnemonic.show_root_acc")}
              value={showRootAcc}
              onChange={() => setShowRootAcc((p) => !p)}
              className={s.showRoot}
              disabled={
                selectOptions.find((i) => i.value === hdPath)
                  ?.isLegacySwitchLocked === true
              }
            />
          </div>

          <div>
            <button onClick={onRestore} className="bottom-btn">
              {t("new_wallet.continue")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default RestoreMnemonic;
