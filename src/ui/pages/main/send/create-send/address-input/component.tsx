import { shortAddress } from "@/shared/utils/transactions";
import { Combobox } from "@headlessui/react";
import { BookOpenIcon } from "@/ui/icons/phosphor";
import s from "./styles.module.scss";
import { FC, useState } from "react";
import { useAppState } from "@/ui/states/appState";
import { t } from "i18next";
import { getAddressType, ss } from "@/ui/utils";

interface Props {
  address: string;
  onChange: (value: string) => void;
  onOpenModal: () => void;
  /** When true, the input renders with a red (danger) border. */
  error?: boolean;
}

const AddressInput: FC<Props> = ({ address, onChange, onOpenModal, error }) => {
  const [filtered, setFiltered] = useState<string[]>([]);

  const { addressBook, network } = useAppState(ss(["addressBook", "network"]));

  // Saved addresses are network-specific: only suggest ones valid on the
  // current network (a mainnet address can't be selected on regtest, etc.).
  const getFiltered = (query: string) => {
    return addressBook.filter(
      (i) => getAddressType(i, network) !== undefined && i.startsWith(query)
    );
  };

  return (
    <div className={s.wrapper}>
      {/* headlessui hands back `null` when the selection is cleared. */}
      <Combobox value={address} onChange={(v) => onChange(v ?? "")}>
        <div className={s.comboWrap}>
          <Combobox.Input
            displayValue={(address: string) => address}
            autoComplete="off"
            className={error ? "input inputError" : "input"}
            value={address}
            placeholder={t(
              "send.create_send.address_input.address_placeholder"
            )}
            onChange={(v) => {
              onChange(v.target.value.trim());
              setFiltered(getFiltered(v.target.value.trim()));
            }}
          />

          {filtered.length > 0 ? (
            <Combobox.Options className={s.addressbookoptions}>
              {filtered.map((address) => (
                <Combobox.Option
                  className={s.addressbookoption}
                  key={address}
                  value={address}
                >
                  {shortAddress(address, 14)}
                </Combobox.Option>
              ))}
            </Combobox.Options>
          ) : (
            ""
          )}
        </div>
      </Combobox>
      <div
        className={s.bookBtn}
        onClick={(e) => {
          e.preventDefault();
          onOpenModal();
        }}
      >
        <BookOpenIcon size={20} />
      </div>
    </div>
  );
};

export default AddressInput;
