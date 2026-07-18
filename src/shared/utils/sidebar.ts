import browser from "webextension-polyfill";

/** Persisted preference: is the wallet in Chrome side-panel mode? */
export const SIDEBAR_MODE_KEY = "espo_sidebar_mode";

/** The Chrome side-panel surface (absent on Firefox / older Chrome). */
type ChromeLike = {
  sidePanel?: {
    setPanelBehavior: (o: { openPanelOnActionClick: boolean }) => Promise<void>;
    open: (o: { windowId?: number; tabId?: number }) => Promise<void>;
  };
  action?: { setPopup: (o: { popup: string }) => Promise<void> };
  windows?: { getCurrent: () => Promise<{ id?: number }> };
};

export const chromeApi = (globalThis as { chrome?: ChromeLike }).chrome;

/** Whether side-panel mode is available in this browser. */
export const sidebarSupported = (): boolean => !!chromeApi?.sidePanel;

export async function getSidebarMode(): Promise<boolean> {
  try {
    const r = await browser.storage.local.get(SIDEBAR_MODE_KEY);
    return !!(r as Record<string, unknown>)[SIDEBAR_MODE_KEY];
  } catch {
    return false;
  }
}

/**
 * Point the toolbar icon at the side panel (on) or the popup (off). A popup, if
 * set, wins over `openPanelOnActionClick`, so we clear/restore it accordingly.
 * Not persistent across restarts on its own — re-applied from storage on
 * background startup.
 */
export async function applySidebarMode(enabled: boolean): Promise<void> {
  if (!chromeApi?.sidePanel || !chromeApi.action) return;
  try {
    if (enabled) {
      await chromeApi.action.setPopup({ popup: "" });
      await chromeApi.sidePanel.setPanelBehavior({
        openPanelOnActionClick: true,
      });
    } else {
      await chromeApi.action.setPopup({ popup: "index.html" });
      await chromeApi.sidePanel.setPanelBehavior({
        openPanelOnActionClick: false,
      });
    }
  } catch {
    /* side-panel/action APIs unavailable — ignore */
  }
}

export async function setSidebarMode(enabled: boolean): Promise<void> {
  await browser.storage.local.set({ [SIDEBAR_MODE_KEY]: enabled });
  await applySidebarMode(enabled);
}
