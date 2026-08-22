import fs from "node:fs";
import { defineConfig } from "wxt";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import pkg from "./package.json";

/**
 * Mirrors the old build.ts dotenv plugin: every KEY=VALUE line in .env is
 * exposed to the app as process.env.KEY. Keys that are not defined resolve to
 * undefined at runtime (via the process polyfill), so the fallback URLs in
 * src/shared/constant apply.
 */
function loadDotEnvDefines(): Record<string, string> {
  const defines: Record<string, string> = {};
  if (!fs.existsSync(".env")) return defines;
  for (const line of fs.readFileSync(".env", "utf8").split("\n")) {
    const [key, value] = line.split("=");
    if (key && value) {
      defines[`process.env.${key.trim()}`] = JSON.stringify(
        value.trim().replace(/^["']|["']$/g, "")
      );
    }
  }
  return defines;
}

export default defineConfig({
  srcDir: "src",
  modules: ["@wxt-dev/module-react"],
  // Keep the extension dev server OFF port 3000: in the monorepo it races
  // the Next.js frontend for it (whoever binds first wins and the other
  // falls to 3001, breaking the expected localhost:3000).
  dev: {
    server: {
      port: 3010,
    },
  },
  manifest: ({ browser, command }) => {
    const manifest: Record<string, unknown> = {
      name: "Espo Wallet",
      short_name: "Espo Wallet",
      author: "Espo",
      icons: {
        "48": "/logo-48.png",
        "128": "/logo-128.png",
      },
      action: {
        default_popup: "index.html",
        default_title: "Open the popup",
        default_icon: {
          "48": "/logo-48.png",
          "128": "/logo-128.png",
        },
      },
      permissions: ["storage", "unlimitedStorage", "sidePanel"],
      web_accessible_resources: [
        {
          resources: ["pageProvider.js"],
          matches: ["<all_urls>"],
        },
      ],
      content_security_policy: {
        extension_pages:
          "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
      },
    };

    if (browser === "firefox") {
      manifest.browser_specific_settings = {
        gecko: {
          id: "espo-wallet@espo.sh",
          strict_min_version: "113.0",
        },
        gecko_android: {
          strict_min_version: "113.0",
        },
      };
    } else {
      manifest.minimum_chrome_version = "99";
      // Same UI, shown in Chrome's side panel when the user toggles sidebar
      // mode. The query flag lets the app relax the fixed popup width.
      manifest.side_panel = { default_path: "index.html?sidepanel=1" };
      if (command === "serve") {
        // Dev convenience carried over from the old build: open the wallet UI
        // in every new tab while developing.
        manifest.chrome_url_overrides = { newtab: "index.html" };
      }
    }

    return manifest;
  },
  vite: () => ({
    resolve: {
      // The monorepo root hoists react@19 for other workspaces; wallet deps
      // hoisted there would resolve it and bundle a second React (null
      // dispatcher crash). Force every react import to this package's copy.
      dedupe: ["react", "react-dom"],
    },
    define: {
      "process.browser": "false",
      "process.env.VERSION": JSON.stringify(pkg.version),
      ...loadDotEnvDefines(),
    },
    plugins: [
      nodePolyfills({
        include: ["buffer", "process"],
        globals: {
          Buffer: true,
          process: true,
          global: true,
        },
      }),
    ],
  }),
});
