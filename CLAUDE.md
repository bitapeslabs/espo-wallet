# CLAUDE.md

Espo Wallet is a Bitcoin browser-extension wallet (Chrome MV3 + Firefox MV3),
forked from the Nintondo (Bells) extension and fully converted: bitcoinjs-lib
chain layer, esplora/mempool.space APIs, and a hand-built design system copied
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
- Transactions: `txBuilder.ts` does greedy coin selection + PSBT; P2PKH
  inputs fetch prev-tx hex for nonWitnessUtxo; taproot inputs get
  tapInternalKey. Dust limit 546.
- API: `apiController.ts` is esplora-compatible. Base URL per network:
  user override from settings (`appState.esploraUrl`) or defaults
  (mainnet https://mempool.space/api, regtest http://localhost:3002).
  Fees: mempool `/v1/fees/recommended` on mainnet, `/fee-estimates`
  fallback elsewhere. BTC price ALWAYS from mempool.space `/v1/prices`
  (regtest coins are valued like mainnet BTC).
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
  /search with the fixed bottom navbar. Swap and Search are placeholders.
- Wallet home: navbar (wallet widget: name + ellipsized address + copy +
  caret to accounts; settings gear) -> big USD worth -> Send/Swap/Receive
  square buttons (`square-action` component, hover swaps to fill icon) ->
  Tokens/Collectibles text tabs -> espo-style asset cards. BTC is always
  the first asset; alkanes arrive through the kept (currently empty)
  context wiring in `src/ui/utils/inscriptions-ctx.tsx`.
- Accounts vs wallets: the navbar widget opens the ACCOUNT list (the +
  derives a new account in the current HD wallet). Separate HD wallets are
  managed under Settings > Wallet > Wallets.

## Known traps

- App startup order matters: in `App.tsx` setupApp, wallet state
  (vaultIsEmpty) must reach the store BEFORE isReady flips, or the guest
  router mounts against defaults and strands users on the wrong screen.
  The welcome and login pages both self-correct, keep it that way.
- The popup body width is FIXED at 350px (`width`, not min-width) so the
  popup never resizes with content; the >=455px media query relaxes it for
  the expanded tab view.
- `.wxt/` is generated (`bun x wxt prepare`); tsconfig extends it. Do not
  exclude `.wxt` from tsconfig (it declares `#imports`).
- The alkanes/BEL-20 DATA layer was stripped; display components and
  contexts were deliberately KEPT and return empty lists. Do not delete
  them; they are the mount points for a future alkanes indexer.
- Headless verification trick: the popup + background can be run together
  under bun with happy-dom and a stubbed `chrome.*` (in-memory port
  bridge). See git history for `popup-harness.ts` (scratchpad, ephemeral):
  it renders the real built bundles and prints the rendered text; a
  `--vault` variant pre-seeds storage to test the returning-user flow.
