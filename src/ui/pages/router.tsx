import { createHashRouter, Navigate } from "react-router-dom";

import Wallet from "@/ui/pages/main/wallet";

import Login from "@/ui/pages/main/login";
import CreatePassword from "./main/create-password";
import CreateNewAccount from "./main/new-account";
import SwitchAccount from "./main/switch-account";
import PagesLayout from "@/ui/components/layout";
import Receive from "./main/receive";
import SwitchWallet from "./main/switch-wallet";
import EditWallet from "./main/edit-wallet";
import EditAccount from "./main/edit-account";
import NewWallet from "./main/new-wallet";
import NewMnemonic from "./main/new-wallet/new-mnemonic";
import RestoreMnemonic from "./main/new-wallet/restore-mnemonic";
import RestorePrivKey from "./main/new-wallet/restore-priv-key";
import Settings from "./main/settings";
import ShowPk from "./main/switch-account/show-pk";
import ShowMnemonic from "./main/switch-wallet/show-mnemonic";
import ChangeAddrType from "./main/settings/wallet/change-addr-type";
import TransactionInfo from "./main/transaction-info";
import FinalleSend from "./main/send/finalle-send";
import CreateSend from "./main/send/create-send";
import ConfirmSend from "./main/send/confirm-send";
import ConfirmSwap from "./main/swap/confirm-swap";
import Connect from "./provider/connect";
import SignMessage from "./provider/sign-message";
import CreateTx from "./provider/create-tx/component";
import ConnectedSites from "./main/settings/connected-sites";
import Language from "./main/settings/language";
import SignPsbt from "./provider/sign-psbt";
import MultiPsbtSign from "./provider/multi-psbt-sign";
import ChangePassword from "./main/settings/security/change-password";
import Security from "./main/settings/security";
import Advanced from "./main/settings/security/advanced";
import WalletSettings from "./main/settings/wallet/component";
import NetworkSettings from "./main/settings/wallet/network/component";
import Home from "./main/home";
import Welcome from "./main/welcome";
import ForgotPassword from "./main/forgot-password";
import TabsShell from "@/ui/components/tabs-shell";
import Swap from "./main/swap";
import Search from "./main/search";
import Activity from "./main/activity";
import Unwraps from "./main/unwraps";
import UnwrapInfo from "./main/unwraps/unwrap-info";
import Asset from "./main/asset";
import ImportWallet from "./main/welcome/import";
import SwitchNetwork from "./provider/switch-network";

export const guestRouter = createHashRouter([
  {
    path: "account",
    children: [
      { path: "login", element: <Login /> },
      { path: "forgot-password", element: <ForgotPassword /> },
      { path: "welcome", element: <Welcome /> },
      { path: "import", element: <ImportWallet /> },
      { path: "create-password", element: <CreatePassword /> },
    ],
  },
  { path: "*", element: <Navigate to={"/account/login"} /> },
]);

export const authenticatedRouter = createHashRouter([
  { path: "/", element: <Home /> },
  { path: "manage-wallets", element: <SwitchWallet /> },
  { path: "edit-wallet/:walletId", element: <EditWallet /> },
  {
    path: "edit-account/:walletId/:accountId",
    element: <EditAccount />,
  },
  {
    element: <TabsShell />,
    children: [
      { path: "home", element: <Wallet /> },
      { path: "asset/:assetId", element: <Asset /> },
      { path: "swap", element: <Swap /> },
      { path: "activity", element: <Activity /> },
      { path: "unwraps", element: <Unwraps /> },
      { path: "search", element: <Search /> },
    ],
  },
  // Outside PagesLayout: the broadcast result screen renders without a header.
  { path: "pages/finalle-send", element: <FinalleSend /> },
  {
    path: "pages",
    element: <PagesLayout />,
    children: [
      { path: "settings", element: <Settings /> },
      { path: "switch-account", element: <SwitchAccount /> },
      { path: "create-new-account", element: <CreateNewAccount /> },
      { path: "change-password", element: <ChangePassword /> },
      { path: "receive", element: <Receive /> },
      { path: "create-new-wallet", element: <NewWallet /> },
      { path: "new-mnemonic", element: <NewMnemonic /> },
      { path: "restore-mnemonic", element: <RestoreMnemonic /> },
      { path: "restore-priv-key", element: <RestorePrivKey /> },
      { path: "show-pk/:accId", element: <ShowPk /> },
      { path: "show-mnemonic/:walletId", element: <ShowMnemonic /> },
      { path: "change-addr-type", element: <ChangeAddrType /> },
      { path: "transaction-info/:txId", element: <TransactionInfo /> },
      { path: "unwrap-info/:txId", element: <UnwrapInfo /> },
      { path: "create-send", element: <CreateSend /> },
      { path: "confirm-send", element: <ConfirmSend /> },
      { path: "confirm-swap", element: <ConfirmSwap /> },
      { path: "connected-sites", element: <ConnectedSites /> },
      { path: "language", element: <Language /> },
      { path: "security", element: <Security /> },
      { path: "advanced", element: <Advanced /> },
      { path: "wallet-settings", element: <WalletSettings /> },
      { path: "network-settings", element: <NetworkSettings /> },
    ],
  },
  {
    path: "provider",
    children: [
      { path: "connect", element: <Connect /> },
      { path: "signMessage", element: <SignMessage /> },
      { path: "createTx", element: <CreateTx /> },
      { path: "signPsbt", element: <SignPsbt /> },
      { path: "multiPsbtSign", element: <MultiPsbtSign /> },
      { path: "switchNetwork", element: <SwitchNetwork /> },
    ],
  },
  { path: "*", element: <Navigate to={"/"} /> },
]);
