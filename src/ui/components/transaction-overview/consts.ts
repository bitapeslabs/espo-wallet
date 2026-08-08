// Hardcoded display overrides ported from espo's explorer (src/explorer/consts.rs
// and src/modules/ammdata/consts.rs). Pre-broadcast we have no trace/ABI, so a
// contract call is labelled from these overrides + the cellpack opcode.

/** Contract-name overrides keyed by alkane id "block:tx" (espo CONTRACT_NAME_OVERRIDES). */
export const CONTRACT_NAME_OVERRIDES: Record<string, string> = {
  "4:65522": "Oyl AMM",
};

/** Token name overrides keyed by "block:tx" (espo ALKANE_NAME_OVERRIDES). */
export const ALKANE_NAME_OVERRIDES: Record<string, string> = {
  "2:0": "DIESEL",
  "32:0": "frBTC",
  "2:68479": "TORTILLA",
};

/** The Oyl AMM contract id (espo get_amm_contract). */
export const AMM_CONTRACT_ID = "4:65522";

/**
 * A best-effort human label for a contract-call opcode. Espo reads the real
 * method name from the contract ABI/trace, which we can't do pre-broadcast, so
 * we only special-case the well-known AMM + token method opcodes it documents
 * (tx_view.rs TOKEN_METHOD_OPCODES / ammdata opcodes).
 */
export function opcodeLabel(contractId: string, opcode: bigint): string | undefined {
  if (contractId === AMM_CONTRACT_ID) {
    if (opcode === 13n) return "swap";
    if (opcode === 14n) return "swap";
    if (opcode === 11n) return "add liquidity";
    if (opcode === 12n) return "remove liquidity";
    if (opcode === 1n) return "create pool";
    if (opcode === 0x61n) return "get reserves";
  }
  const tokenMethods: Record<string, string> = {
    "99": "get_name",
    "100": "get_symbol",
    "101": "get_total_supply",
    "102": "get_cap",
    "103": "get_minted",
    "104": "get_value_per_mint",
  };
  return tokenMethods[opcode.toString()];
}
