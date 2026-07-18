import { shortAddress } from "@/shared/utils/transactions";
import { Combobox } from "@headlessui/react";
import { BookOpenIcon } from "@/ui/icons/phosphor";
import s from "./styles.module.scss";
import { FC, useState } from "react";
import { useAppState } from "@/ui/states/appState";
import { t } from "i18next";
import { ss } from "@/ui/utils";

interface Props {
  address: string;
  onChange: (value: string) => void;
  onOpenModal: () => void;
}

const AddressInput: FC<Props> = ({ address, onChange, onOpenModal }) => {
  const [filtered, setFiltered] = useState<string[]>([]);

  const { addressBook } = useAppState(ss(["addressBook"]));

  const getFiltered = (query: string) => {
    return addressBook.filter((i) => i.startsWith(query));
  };

  return (
    <div className={s.wrapper}>
      <Combobox value={address} onChange={onChange}>
        <div className={s.comboWrap}>
          <Combobox.Input
            displayValue={(address: string) => address}
            autoComplete="off"
            className="input"
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
