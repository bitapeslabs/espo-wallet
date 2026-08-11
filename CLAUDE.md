# CLAUDE.md

Espo Wallet is a Bitcoin browser-extension wallet (Chrome MV3 + Firefox MV3),
forked from the Nintondo (Bells) extension and fully converted: bitcoinjs-lib
chain layer, the espo JSON-RPC data layer, and a hand-built design system copied
from the b8 dashboard / espo explorer. Built with WXT + React + zustand.

## Build and run

```bash
bun i                  # install (runs `wxt prepare`)
bun run dev            # dev server, Chrome (WSL cannot auto-open a browser:
                       # load .output/chrome-mv3-dev manually)
bun run build          # production build -> .output/chrome-mv3
bun run build:firefox  # -> .output/firefox-mv3 (MUST pass --mv3, see scripts)
bun run compile        # tsc --noEmit
bun run zip / zip:firefox / release
```

After every change run `bun x tsc --noEmit` and `bun run build`; both must be
clean. Reloading the extension in the browser requires the reload arrow on
chrome://extensions (stale half-cached states produce ghost bugs).

## Hard rules

### Design system (do not reintroduce frameworks)

- Tailwind was deliberately REMOVED. Never add tailwind classes, `@apply`, or
  the dependency back. All styling is plain CSS: global classes in
  `src/ui/index.global.scss` (the design system) plus small per-component
  `styles.module.scss` files.
- The look is copied from b8/espo: dark palette on CSS variables (`--panel3`
  app background with the topographic `waves-light.svg`, `--panel` cards,
  `--panel2` controls, `--link-dark` primary blue, `--link` light primary,
  8px `--radius`). Colors ONLY via the variables; never hardcode hexes in
  components (exceptions live in the token list itself).
- One control height: `--control-h` (44px) for inputs, `.btn`, `.bottom-btn`,
  and dropdown triggers, so stacked forms sit flush. `.btn.small` = 34px,
  `.btn.big` = 50px.
- Inter is the ONLY typeface (self-hosted woff2). Monospace is banned
  everywhere, including addresses, txids, and mnemonics.
- Em dashes are banned in user-facing copy.
- No hover tooltips: never put an HTML/SVG `title` attribute on any element.
  The Phosphor `icon()` factory and `CopyBtn` accept a `title` prop but
  deliberately IGNORE it (do not render it), so a stray title prop is
  harmless but pointless. The ONLY legitimate `title` props are the heading
  text of `Modal` / `Drawer` and the visible label of `FeeCard` (these render
  as visible text, not tooltips).
- Hover convention: hover state applies instantly (`transition: none` on
  :hover), the un-hover eases back (transition on the base rule).
- Buttons: `.btn` (primary blue), `.btn.ghost` (panel2, hovers to
  `--panel2-light`), `.btn.danger`. Custom dropdowns use the espo
  `.dropdown` classes, never a native select. Switches use `.switch`.
- Espo alkane balance cards (`.io-alkanes`, `.alk-card`, `.alk-line`,
  `.alk-icon-wrap`, `.alk-amt`, `.alk-sym`) are in the global stylesheet and
  power the wallet's token list.

### Icons

- Phosphor only, inlined as React components in `src/ui/icons/phosphor.tsx`
  (regular, bold, and fill weights as needed). To add one, copy the path data
  from the phosphor repo into a new `icon(...)` export. No icon libraries as
  runtime dependencies (heroicons was removed).
- Bottom navbar: bold outline when inactive (`--muted2`), fill variant when
  active (`--link`).
- Header icon buttons (back arrow, +, etc.) must be UNIFORM across the whole
  app: the bold-outline caret (`CaretLeftBoldIcon`) at size 18 in a 34px
  transparent ghost button that fills to `--panel2` on hover. Do not mix the
  regular and bold caret weights in headers, they render at visibly different
  sizes. The shared PagesLayout header (`components/layout`) and every custom
  page header (manage-wallets, edit-wallet, asset, create-password,
  forgot-password, welcome/import) all use the bold variant.
- Page headers must be UNIFORM height: `min-height: 3.4rem`, `padding: 8px 12px`,
  `--panel3` background with the standard bottom shadow. Every header (shared
  PagesLayout and custom page headers) uses these exact values; do not invent
  per-page header heights.
- Carets must be UNIFORM: always the bold Phosphor variant
  (`CaretDown/Up/Left/RightBoldIcon`). Header back arrows are size 18; every
  other indicator caret (dropdown triggers, the wallet widget, list-row
  chevrons, expand toggles) is size 14 and coloured `--muted2` when idle,
  `--text`/white when its interactive parent is hovered (dropdown carets get
  this via the global `.dropdown-caret` rules). Never use the regular-weight
  caret or a one-off size/colour.
- The espo network roundel lives in `src/ui/components/network-icon`
  (orange #f7931a mainnet, green #5fd15c regtest). The wallet's own brand
  glyph is `src/ui/icons/EspoGlyph.tsx` (extracted from
  `public/espo-icon.svg`; its `bloom` prop applies a multi-layer gaussian
  SVG filter, used on the welcome and unlock screens).

### agent-context/

`agent-context/` is a scratch folder of reference repos (b8, espo,
phosphor-core, the original icon SVG). NOTHING the extension builds or runs
may import from it; the tsconfig excludes it. Copy assets into `src/` or
`public/` instead.

### i18n

- Every user-facing string goes through i18next `t()` with keys present in
  ALL FOUR locale files: `src/shared/locales/languages/{en,ru,ch,kr}.json`.
  Adding a key to en.json only is a bug (missing keys silently render
  English or the raw key). Chinese must be real Mandarin, not English.
- Proper nouns that stay latin: "Espo Wallet", "Alkanes", "BTC".
- Language switching happens WITHOUT window.location.reload(): App.tsx
  re-keys the RouterProvider on i18next's `languageChanged`. The language
  dropdown component is `src/ui/components/language-dropdown` (all four
  languages).

## Architecture

- `src/entrypoints/` are thin WXT wrappers; real code lives in
  `src/background`, `src/content-script`, `src/ui`. Entrypoint side effects
  must stay inside `main()` (WXT imports entrypoints at build time).
- Popup UI talks to the background over port messaging (`PortMessage`,
  port name "popup"); controllers are Proxy objects (`src/ui/utils/setup.ts`)
  routed by type: controller/openapi/state/keyring/notification.
- Keyring: `src/background/services/keyring/hdw/` is a bitcoinjs-lib v6
  (Buffer API) reimplementation of bellhdw's exact interface: HDPrivateKey /
  HDSimpleKey, AddressType enum (P2WPKH default, path m/84'/0'/0'/0).
  Message signing is sha256 + ECDSA base64 (NOT BIP-137/322), kept from the
  original wallet. secp backend is @bitcoinerlab/secp256k1 (no wasm).
  Do NOT upgrade to bitcoinjs-lib v7 / bip32 v5 / ecpair v3 casually: those
  are Uint8Array rewrites and the codebase uses the Buffer API.
- Transactions: ALL tx construction (wallet sends, swaps, and the dapp
  `createTx` path) goes through the alkanesjs SDK — see the alkanesjs note
  under Portfolio/assets. The old hand-rolled `txBuilder.ts` is deleted;
  `sendBTC` emulates `receiverToPayFee` by building once to learn the fee and
  rebuilding with the reduced amount.
- API: `apiController.ts` talks to espo over JSON-RPC 2.0 (`espoRpc` in
  `src/shared/utils`, POST to the network's `/rpc` endpoint, named-object
  params, `{result}` / `{error}` envelope; module methods also carry an
  in-band `{ok:false,error}` that callers check). Endpoint per network:
  user override from settings (`appState.rpcUrl`) or defaults (mainnet
  https://api.alkanode.com/rpc, regtest https://regtest.espo.sh/rpc).
  Method map: UTXOs + prev-tx hex + outpoint values all come from
  `essentials.get_address_spendable_outpoints` ({address, omit_raw_tx});
  BTC balance is derived by summing those outpoint `value`s (no balance
  RPC exists). History is `essentials.get_address_transactions`
  ({address, page, limit, only_alkane_txs:false}) mapped onto the wallet's
  esplora-shaped `ITransaction`. Broadcast is `btc.broadcast_transaction`
  ({raw_tx})→{txid} — the old root `broadcast_transaction` alias is GONE from
  newer espo nodes; chain tip is root `get_espo_height`→{height}; fees are
  root `fee_estimates` (absent on older nodes → falls back to
  `DEFAULT_FEES`). BTC/USD price is `ammdata.get_btc_usd_price` (price =
  decimal string USD×10^16); there is NO mempool.space fallback anywhere
  (removed). `ammdata.get_btc_usd_price` can be `price_unavailable` (e.g.
  regtest), so `currentPrice` may be undefined and `networkInfo.hasPrice`
  false; the home worth does NOT depend on it — it is driven purely by
  `get_portfolio_stats.total_value_usd` (regtest returns real $0 values). Both
  networks now have the ammdata portfolio.
  `get_address_transactions` now returns a real `blockTime`, so `mapEspoTx`
  uses it directly for history day-grouping; confirmations are recomputed
  from blockHeight and the tip. Token-bearing outpoints (non-empty
  `alkanes`/`runes`) are excluded from BTC coin selection so a send never
  burns them. There is no arbitrary-txid RPC: `getTransaction` resolves
  single txs from the current account's history.
- Activity feed: `apiController.getActivity(address, page)` builds the
  Phantom-style feed for the /activity tab. It MERGES espo's address-scoped
  semantic feed `tokendata.get_address_activity` ({address, page, limit, dir})
  — kinds `buy`/`sell`/`liquidity_add`/`liquidity_remove`/`pool_create`/`mint`,
  each with signed per-token deltas from the ADDRESS's perspective (positive =
  received/in, negative = sent/out; espo negates the pool delta, so LP adds are
  both-negative, removes both-positive) — deduped by txid (tokendata emits one
  mirrored row per token). Non-AMM txs come from `get_address_transactions`
  (raw, with `runestone.protostones`): PLAIN ALKANE TRANSFERS are classified
  from the protostone EDICTS (protorune/runes rules) — an edict whose `output`
  vout is owned by the address = received, the address spending an input while
  edicts pay others = sent. A protostone tx we CAN'T decode into alkane legs
  (pointer-only transfer — the amount isn't recoverable since `get_outpoint_-
  balances` only holds current state; or another op) is `other` (app
  interaction), NEVER a BTC transfer (its dust/fee BTC delta is incidental).
  Only NON-protostone txs are BTC send/receive. But tokendata indexes a swap
  under the address that RECEIVES the swapped output, so a swap the wallet only
  FUNDED (output to another address) isn't in its tokendata feed and lands as
  `other`; those (a protostone with a non-empty `message` = contract call) are
  recovered via `get_alkane_tx_summary` — its net alkane `outflow`, NEGATED to
  the trader's view (mixed signs = swap, all+ = receive, all- = send). A pure
  transfer (protostone with edicts/pointer, NO message) that stayed `other`
  is decoded by `resolveEdictTransfer`: it buckets each edict/pointer
  destination's alkanes by owner (edict amount, or `get_outpoint_balances` for
  `0`-amount "transfer all"/pointer dests, empty once spent) — to a non-user
  output = `send`, to the user's output = `receive`, spread across 2+ of the
  user's OWN outputs = `split` (a self-consolidation; rendered with no sign or
  color). Each `IActivityEntry` has `kind` + 1-2 `legs`
  ({assetId "block:tx"|"btc", signed 8-decimal delta string}). The UI
  (`pages/main/activity`) has a "History" title, resolves symbols via the
  portfolio + `KNOWN_ALKANES`, colors positive legs `--success`, and
  (`activity-icon.tsx`) draws overlapping pair icons for swaps/LP, a
  Phosphor-fill status badge (`ArrowDownFill`/`ArrowUpRightFill`) for
  send/receive, and `public/diesel.svg` on a panel tile for `other`.
  `tokendata` is deployed on both networks. The old BTC-only
  `transactions-list` was removed.
- Portfolio / assets: `apiController.getPortfolioStats` calls
  `ammdata.get_portfolio_stats` ({address}) → total USD value + 24h change,
  plus a per-asset map keyed `"btc"` and `"block:tx"` (name, symbol, raw
  8-decimal `balance` string, `price_now_usd`, `value_now_usd`, `change_24h`;
  all USD are decimal strings). This drives the home page's total worth, the
  BTC balance, and the alkane asset list (`src/ui/utils/assets-ctx.tsx` — the
  `AssetManagerProvider` / `useAssetManagerContext` — polls it and exposes
  `portfolio` + `alkanes`). Every alkane (and BTC in sats) has 8
  decimals (`ALKANE_DECIMALS`). Alkane icons come from the ordiscan CDN like
  the espo explorer: `https://cdn.ordiscan.com/alkanes/{block}_{tx}` with the
  explorer's per-id overrides, via `alkaneIconUrl` + the `AlkaneIcon`
  component (letter-avatar fallback on load error).
- alkanesjs (v1.3+, the abis/accounts SDK, consumed as the monorepo WORKSPACE
  package `packages/alkanesjs`): all tx construction goes through an
  `Account.fromSignPsbt` adapter (`keyringService.sdkAccount`) — the SDK hands
  an unsigned base64 PSBT to the keyring's own `signPsbt`, which signs and
  FINALIZES in-process; keys never reach the SDK. The Provider needs TWO urls
  (`espoProvider.ts`): espo (index/utxos/broadcast, user-overridable) and
  metashrew/kirby (`networkInfo(network).metashrewUrl` — views/simulation,
  e.g. the frBTC premium read). Transfers: `keyringService.sendTransfer`
  ({assetId "btc"|"block:tx", toAddress, rawAmount string, feeRate}) =
  `account.tx().transfer(...)` — "sats" for BTC (a pure BTC send writes no
  protostone), `{block,tx}` for an alkane. Swaps/wraps/unwraps:
  `keyringService.buildSwapPackage` delegates to
  `keyring/swapBuilder.ts` (`buildSwapPackageTxs`), which composes the five
  shapes (wrap / unwrap / token swap / wrap+swap CPFP / swap+unwrap CPFP)
  from `FrBTCAbi` + `OylAMMAbi` contracts. CPFP packages are built through
  the SDK's `buildChain` so parent and child share ONE coin-selection
  context — building them separately double-spends the parent's inputs and
  the node rejects the child. Both package txs are priced at the requested
  feeRate (each must relay on its own; the old parent-at-relay-floor trick is
  gone because the wallet broadcasts individually, not via submit_package).
  Exact-in AMM swaps use factory opcode 13 (full path) standalone, opcode 29
  implicit with the path's REMAINING hops as the wrap->swap child; exact-out
  is opcode 14. `unwrap`'s first cellpack arg is the REAL vout of the signer
  anchor: with the swapBuilder's composition that is always 2 (0 = alkanes
  home output, 1 = own asset address bought by the frBTC handoff, 2 = the
  signer dust output). All five shapes are regtest-verified on-chain.
  NEVER import from `alkanesjs/boxed` in wallet code: its ESM bundle has no
  static named re-exports of bxrs (vite build fails with MISSING_EXPORT) —
  bxrs responses carry `.unwrap()` themselves. The asset-page Send passes the
  tapped `IPortfolioAsset` to `/pages/create-send` as
  `location.state.sendAsset`; create-send renders that asset's balance card
  above the address input and builds through `useCreateTransferCallback`.
  Edit the SDK under `packages/alkanesjs`, run its build, and the wallet
  picks it up (workspace symlink).
- Block explorer: each network has its own `explorerUrl` (mainnet
  https://espo.sh, regtest https://regtest.espo.sh), user-overridable from
  Settings > Network (`appState.explorerUrl`). `explorerTxUrl(network, txid,
  override?)` builds `{base}/tx/{txid}`. Activity rows open it in a new tab;
  the transaction-info "open in explorer" button uses it too.
- Networks: `src/shared/networks.ts` (mainnet | regtest slugs,
  bitcoinjs networks.bitcoin / networks.regtest). The provider API
  (`window.espo`, `espo#initialized`, channel ESPOWALLET) speaks these
  slugs. Interface: `src/shared/interfaces/providerApi.ts`.
- Storage: browser.storage.local with an `espo: true` marker in the cache;
  `storageService.init()` WIPES any storage without the marker (no
  migration from the Bells era). The vault (`enc`) is AES via
  nintondo-browser-passworder; wallet secrets only decrypt with the
  session password.
- Validation: zod schemas live in `src/shared/validators/` (password
  strength scoring copied from b8: +1 each for 8+ chars, 12+ chars, mixed
  case, digit, symbol; minimum "Good" = 3). The strength meter component is
  `src/ui/components/password-meter`.

## UI structure worth knowing

- Onboarding: welcome (glyph + bloom + vignette, language dropdown,
  Create New Wallet / Import Wallet) -> create-password (standardized
  header shows the chosen flow, dot breadcrumbs) -> seed/import flow.
  The chosen flow is stashed in sessionStorage (`espo_onboarding_next`)
  and consumed by `pages/main/home/index.tsx` after the password is set.
- Unlock screen mirrors the welcome layout (glyph near top, "Enter your
  password", input, Unlock pinned at the bottom).
- Main app: TabsShell wraps /home, /asset/:assetId, /swap, /activity,
  /search with the bottom navbar. Swap and Search are placeholders. In the
  popup, TabsShell is a fixed-height (`100vh`) flex column: `.content`
  scrolls internally (`overflow-y:auto`, `min-height:0`) and the navbar is an
  in-flow sibling below it (NOT `position:fixed`). This is deliberate: if the
  navbar were fixed with `left/right:0` while the whole document scrolled, the
  content scrollbar would shrink the navbar's width. Keep the scroll inside
  `.content`. The >=455px tab view relaxes this (shell grows, document
  scrolls, navbar sticky).
- Wallet home: navbar (wallet widget: name + ellipsized address + copy +
  caret to accounts; settings gear) -> big USD worth -> Send/Swap/Receive
  square buttons (`square-action` component, hover swaps to fill icon) ->
  Tokens/Collectibles text tabs -> espo-style asset cards. BTC is always
  the first asset; alkanes (with USD value + 24h change) follow from the
  espo portfolio via `src/ui/utils/assets-ctx.tsx` (mainnet only).
  Tapping an asset opens `/asset/:assetId` (`btc` or the alkane `block:tx`).
  Big numbers auto-shrink to fit: `components/fit-text` (`FitText`) scales the
  font down (never up past `maxFont`) so the worth + asset-page amount keep
  >=20px from the screen edges (`screenMargin={20}`) and balance-card numbers
  never exceed ~100px (`maxWidth`); nested symbols use `em` so they scale with
  the number. Balance amounts are formatted with `formatAlkaneAmount` (raw
  8-decimal string -> trimmed, no trailing zeros, e.g. `999.1`), never
  `toFixed(8)`.
- Accounts vs wallets: the navbar widget opens the ACCOUNT list (the +
  derives a new account in the current HD wallet). Separate HD wallets are
  managed under Settings > Wallet > Wallets.

## Known traps

- App startup order matters: in `App.tsx` setupApp, wallet state
  (vaultIsEmpty) must reach the store BEFORE isReady flips, or the guest
  router mounts against defaults and strands users on the wrong screen.
  The welcome and login pages both self-correct, keep it that way.
- Network switching is network-scoped-state sensitive: balance, portfolio,
  price, tip and history all differ per network (and each network has its own
  addresses). `walletController.switchNetwork` clears every account's
  `balance` and updates the wallets (new addresses) BEFORE flipping
  `appState.network`, so the UI never renders the new network with the old
  balance. `assets-ctx` and `tx-ctx` also reset portfolio/price/tip/history on
  the `network` change. `getAccountStats` returns `undefined` (not
  `balance:0`) on a failed/wrong-network lookup so a stale switch never flashes
  `$0.00`. `assets-ctx` resets `portfolio` to `undefined` on every
  account/network change (guarded by an invalidation token so an in-flight
  fetch from the previous network can't apply), and polls refresh it in place
  without clearing it. The home worth and tokens tab treat `portfolio ===
  undefined` as the loading state and show a skeleton/loader; the worth is
  ALWAYS the portfolio's `total_value_usd` (never a BTC amount or a transient
  BTC-only estimate) once loaded. Keep these resets and gates.
- The popup body width is FIXED at 350px (`width`, not min-width) so the
  popup never resizes with content; the >=455px media query relaxes it for
  the expanded tab view.
- `.wxt/` is generated (`bun x wxt prepare`); tsconfig extends it. Do not
  exclude `.wxt` from tsconfig (it declares `#imports`).
- The legacy BEL-20 / ordinals layer (data + all its display components,
  pages, contexts, interfaces, and locale keys) has been fully removed; this
  wallet has no inscriptions, so the word "inscription" appears nowhere in
  the codebase. Assets are alkanes only, live via the espo portfolio (see the
  Portfolio/assets note under Architecture); both BTC and alkane sending are
  wired through the `alkanesjs` SDK.
- Headless verification trick: the popup + background can be run together
  under bun with happy-dom and a stubbed `chrome.*` (in-memory port
  bridge). See git history for `popup-harness.ts` (scratchpad, ephemeral):
  it renders the real built bundles and prints the rendered text; a
  `--vault` variant pre-seeds storage to test the returning-user flow.
