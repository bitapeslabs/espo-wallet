import { useState } from "react";
import { useNavigate } from "react-router-dom";
import cn from "classnames";
import { t } from "i18next";
import s from "./styles.module.scss";
import {
  useGetCurrentWallet,
  useGetCurrentAccount,
  useWalletState,
} from "@/ui/states/walletState";
import {
  useSwitchWallet,
  useSwitchAccount,
  useCreateNewAccount,
} from "@/ui/hooks/wallet";
import { ss } from "@/ui/utils";
import { shortAddress } from "@/shared/utils/transactions";
import {
  CaretLeftBoldIcon,
  CaretDownBoldIcon,
  CaretUpBoldIcon,
  PlusBoldIcon,
  DotsThreeVerticalBoldIcon,
} from "@/ui/icons/phosphor";

const SwitchWallet = () => {
  const navigate = useNavigate();
  const { wallets } = useWalletState(ss(["wallets"]));
  const currentWallet = useGetCurrentWallet();
  const currentAccount = useGetCurrentAccount();
  const switchWallet = useSwitchWallet();
  const switchAccount = useSwitchAccount();
  const createNewAccount = useCreateNewAccount();

  const [expanded, setExpanded] = useState<Record<number, boolean>>({
    [currentWallet?.id ?? 0]: true,
  });

  const toggle = (id: number) =>
    setExpanded((p) => ({ ...p, [id]: !p[id] }));

  const selectAccount = async (walletId: number, accountId: number) => {
    if (currentWallet?.id !== walletId) {
      await switchWallet(walletId);
    }
    await switchAccount(accountId);
  };

  const addAccount = async (walletId: number) => {
    if (currentWallet?.id !== walletId) {
      await switchWallet(walletId);
    }
    await createNewAccount();
  };

  return (
    <div className={s.manage}>
      <div className={s.header}>
        <button
          type="button"
          className="header-icon-btn"
          onClick={() => navigate(-1)}
        >
          <CaretLeftBoldIcon size={18} />
        </button>
        <span className={s.headerTitle}>{t("switch_wallet.title")}</span>
        <button
          type="button"
          className="header-icon-btn"
          onClick={() => navigate("/pages/create-new-wallet")}
        >
          <PlusBoldIcon size={18} />
        </button>
      </div>

      <div className={s.walletList}>
          {wallets.map((wallet) => {
            const open = !!expanded[wallet.id];
            return (
              <div className={s.walletBlock} key={wallet.id}>
                <button
                  className={s.walletRow}
                  onClick={() => toggle(wallet.id)}
                >
                  <span className={s.walletName}>{wallet.name}</span>
                  <span
                    className={s.walletMenu}
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/edit-wallet/${wallet.id}`);
                    }}
                  >
                    <DotsThreeVerticalBoldIcon size={18} />
                  </span>
                  <span className={s.caret}>
                    {open ? (
                      <CaretUpBoldIcon size={14} />
                    ) : (
                      <CaretDownBoldIcon size={14} />
                    )}
                  </span>
                </button>


                {open ? (
                  <div className={s.accounts}>
                    {wallet.accounts.map((account) => {
                      const active =
                        wallet.id === currentWallet?.id &&
                        account.id === currentAccount?.id;
                      return (
                        <button
                          key={account.id}
                          className={cn(s.accountRow, {
                            [s.accountActive]: active,
                          })}
                          onClick={() =>
                            selectAccount(wallet.id, account.id)
                          }
                        >
                          <span className={cn("dot", { on: active })} />
                          <span className={s.accountMeta}>
                            <span className={s.accountName}>
                              {account.name}
                            </span>
                            {account.address ? (
                              <span className={s.accountAddr}>
                                {shortAddress(account.address, 6)}
                              </span>
                            ) : undefined}
                          </span>
                        </button>
                      );
                    })}

                    <button
                      className={s.addAccount}
                      onClick={() => addAccount(wallet.id)}
                    >
                      <PlusBoldIcon size={16} />
                      {t("switch_wallet.add_account")}
                    </button>
                  </div>
                ) : undefined}
              </div>
            );
          })}
      </div>
    </div>
  );
};

export default SwitchWallet;
