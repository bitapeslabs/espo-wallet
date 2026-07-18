import ReactDOM from "react-dom/client";
import "./index.global.scss";
import App from "./App";
import { StrictMode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import "../shared/locales/i18n";
import { TransactionManagerProvider } from "./utils/tx-ctx";
import { AssetManagerProvider } from "./utils/assets-ctx";
import { queryClient } from "./utils/query";

// Rendered in Chrome's side panel (see wxt.config side_panel default_path): let
// the stylesheet drop the fixed popup width so it fills the panel.
if (new URLSearchParams(window.location.search).has("sidepanel")) {
  document.documentElement.classList.add("sidepanel");
}

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
);

root.render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <TransactionManagerProvider>
        <AssetManagerProvider>
          <App />
        </AssetManagerProvider>
      </TransactionManagerProvider>
    </QueryClientProvider>
  </StrictMode>
);
