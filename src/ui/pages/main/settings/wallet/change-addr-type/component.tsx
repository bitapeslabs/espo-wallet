import SwitchAddressType from "@/ui/components/switch-address-type";
import { useControllersState } from "@/ui/states/controllerState";
import { useGetCurrentWallet, useWalletState } from "@/ui/states/walletState";
import { AddressType } from "@/background/services/keyring/hdw";
import { useNavigate } from "react-router-dom";
import { ss } from "@/ui/utils";
import toast from "react-hot-toast";
import { ADDRESS_TYPES } from "@/shared/constant";
import s from "./styles.module.scss";

const ChangeAddrType = () => {
  const { keyringController, walletController, notificationController } =
    useControllersState(
      ss(["keyringController", "walletController", "notificationController"])
    );
  const { selectedWallet, updateSelectedWallet, selectedAccount } =
    useWalletState(
      ss(["selectedWallet", "updateSelectedWallet", "selectedAccount"])
    );
  const currentWallet = useGetCurrentWallet();
  const navigate = useNavigate();

  const onSwitchAddress = async (type: AddressType) => {
    if (
      typeof selectedWallet === "undefined" ||
      typeof selectedAccount === "undefined" ||
      typeof currentWallet === "undefined"
    )
      return toast.error("Internal error: Selected wallet not found.");
    const addresses = await keyringController.changeAddressType(
      selectedWallet,
      type
    );
    await updateSelectedWallet({
      addressType: type,
      accounts: currentWallet.accounts.map((f, idx) => ({
        ...f,
        address: addresses[idx],
        id: idx,
      })),
    });
    // The address type drives the keyring's BIP derivation path, so persist the
    // re-serialized keyring (new path) into the vault, or it reverts on unlock.
    await walletController.saveWallets();
    await notificationController.changedAccount();
    navigate("/");
  };

  return (
    <div className={s.changeAddrType}>
      <SwitchAddressType
        selectedType={currentWallet?.addressType ?? ADDRESS_TYPES[0].value}
        handler={onSwitchAddress}
      />
    </div>
  );
};

export default ChangeAddrType;
