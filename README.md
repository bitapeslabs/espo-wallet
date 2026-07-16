# Espo Wallet

A Bitcoin browser extension wallet with the espo / b8 look: dark panels, Inter,
status dots, and the topographic waves background. Forked from the Nintondo
(Bells) extension and converted to Bitcoin.

## Features

- Bitcoin mainnet and regtest, switchable in Settings > Wallet > Network
- Esplora-compatible API backends: mainnet defaults to
  `https://mempool.space/api`, regtest defaults to `http://localhost:3002`
  (a Blockstream electrs esplora endpoint, e.g. the one a local
  [b8](https://github.com/) stack runs). Both URLs are editable per network
  in the network settings.
- HD wallets (BIP39 mnemonic) and single private key (WIF/hex) imports
- Native segwit (P2WPKH, default), legacy (P2PKH), and taproot (P2TR)
  address types
- Fees from mempool.space `fees/recommended` on mainnet; manual sat/vB
  everywhere
- dApp provider injected as `window.espo` (fires `espo#initialized`):
  `connect`, `getAccount`, `getBalance`, `signMessage`, `signPsbt`,
  `multiPsbtSign`, `createTx`, `switchNetwork`, `getNetwork`, and more

There is no migration from the Bells-era wallet: on first run any old
storage is wiped and the wallet starts from onboarding.

## Development

The extension is built with [WXT](https://wxt.dev/).

```bash
bun i                  # install (runs `wxt prepare`)
bun run dev            # dev server with hot reload (Chrome)
bun run dev:firefox    # same, Firefox
```

If the browser cannot be opened automatically (e.g. under WSL), load the
`.output/chrome-mv3-dev` (or `.output/firefox-mv3-dev`) folder manually as
described below.

### Chrome

1. `bun run build`
2. Go to extensions in your browser and click on "Manage Extensions"
3. In top right corner activate "developer mode"
4. In top left corner click on "Load unpacked"
5. Select the `.output/chrome-mv3` folder

### Firefox

1. `bun run build:firefox`
2. Go to `about:debugging#/runtime/this-firefox`
3. Click "Load temporary Add-on..."
4. Select the `.output/firefox-mv3` folder

### Regtest against a local b8 stack

1. Start the b8 regtest stack (bitcoind, electrs, metashrew, espo)
2. In the wallet: Settings > Wallet > Network, switch to Regtest and set the
   Electrs (esplora) URL to your electrs REST endpoint
3. Fund the wallet from the b8 faucet

### Other commands

```bash
bun run zip            # production build + store-ready zip (Chrome)
bun run zip:firefox    # production build + zips + sources zip (Firefox)
bun run release        # both of the above
bun run compile        # TypeScript typecheck
```
