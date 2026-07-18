import { AddressType } from "@/background/services/keyring/hdw/types";

export const KEYRING_TYPE = {
  HdKeyring: "HD Key Tree",
  SimpleKeyring: "Simple Key Pair",
  Empty: "Empty",
};

export const IS_CHROME = /Chrome\//i.test(navigator.userAgent);

export const IS_LINUX = /linux/i.test(navigator.userAgent);

export const IS_WINDOWS = /windows/i.test(navigator.userAgent);

export { NETWORKS } from "../networks";

export const ADDRESS_TYPES: {
  value: AddressType;
  label: string;
  name: string;
  hdPath: string;
}[] = [
  {
    value: AddressType.P2WPKH,
    label: "P2WPKH",
    name: "Native Segwit (P2WPKH)",
    hdPath: "m/84'/0'/0'/0",
  },
  {
    value: AddressType.P2PKH,
    label: "P2PKH",
    name: "Legacy (P2PKH)",
    hdPath: "m/44'/0'/0'/0",
  },
  {
    value: AddressType.P2TR,
    label: "P2TR",
    name: "Taproot (P2TR)",
    hdPath: "m/86'/0'/0'/0",
  },
];

export const EVENTS = {
  broadcastToUI: "broadcastToUI",
  broadcastToBackground: "broadcastToBackground",
  SIGN_FINISHED: "SIGN_FINISHED",
  WALLETCONNECT: {
    STATUS_CHANGED: "WALLETCONNECT_STATUS_CHANGED",
    INIT: "WALLETCONNECT_INIT",
    INITED: "WALLETCONNECT_INITED",
  },
};

export const ESPO_URL = "https://espo.sh";

export const DEFAULT_FEES = {
  fast: 5,
  slow: 2,
};

export const DEFAULT_HD_PATH = "m/84'/0'/0'/0";

/**
 * Canonical BIP derivation path for an address type (BIP84 segwit, BIP86
 * taproot, BIP44 legacy). The keyring derives every account under this path,
 * so it MUST follow the address type: deriving taproot on the segwit path
 * yields addresses that diverge from other wallets (e.g. oyl / BIP86).
 */
export function hdPathForAddressType(addressType: AddressType): string {
  return (
    ADDRESS_TYPES.find((t) => t.value === addressType)?.hdPath ?? DEFAULT_HD_PATH
  );
}
