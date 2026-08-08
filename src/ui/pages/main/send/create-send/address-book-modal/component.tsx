import { shortAddress } from "@/shared/utils/transactions";
import Modal from "@/ui/components/modal";
import { useAppState } from "@/ui/states/appState";
import { MinusCircleIcon } from "@/ui/icons/phosphor";
import { FC } from "react";

import s from "./styles.module.scss";
import { t } from "i18next";
import { getAddressType, ss } from "@/ui/utils";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  setAddress: (address: string) => void;
}

const AddressBookModal: FC<Props> = ({ isOpen, onClose, setAddress }) => {
  const { addressBook, network, updateAppState } = useAppState(
    ss(["addressBook", "network", "updateAppState"])
  );

  // Only list addresses valid on the current network (saved addresses are
  // network-specific).
  const networkBook = addressBook.filter(
    (i) => getAddressType(i, network) !== undefined
  );

  const onRemove = async (address: string) => {
    await updateAppState({
      addressBook: addressBook.filter((i) => i !== address),
    });
  };

  const onSelect = (address: string) => {
    setAddress(address);
    onClose();
  };

  return (
    <Modal
      onClose={onClose}
      open={isOpen}
      title={t("send.create_send.address_book.address_book")}
    >
      {!networkBook.length ? (
        <div className={s.empty}>
          {t("send.create_send.address_book.no_addresses")}
        </div>
      ) : undefined}
      <div className={s.items}>
        {networkBook.map((i, idx) => (
          <div key={`ab-${idx}`} className={s.item}>
            <div onClick={() => onSelect(i)} className={s.address}>
              {shortAddress(i, 17)}
            </div>
            <div className={s.remove} onClick={() => onRemove(i)}>
              <MinusCircleIcon size={20} />
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
};

export default AddressBookModal;
