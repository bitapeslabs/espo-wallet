import { EventEmitter } from "events";

import {
  browserWindowsOnRemoved,
  browserWindowsGetCurrent,
  browserWindowsCreate,
  browserWindowsUpdate,
  browserWindowsRemove,
} from "@/shared/utils/browser";
import {
  CreateNotificationProps,
  OpenNotificationProps,
} from "@/shared/interfaces/notification";
import { IS_WINDOWS } from "@/shared/constant";

export const event = new EventEmitter();

browserWindowsOnRemoved((winId: number) => {
  event.emit("windowRemoved", winId);
});

const BROWSER_HEADER = 80;
const WINDOW_SIZE = {
  width: 354 + (IS_WINDOWS ? 16 : 0),
  height: 600 + (IS_WINDOWS ? 40 : 0),
};

const create = async ({
  url,
  ...rest
}: CreateNotificationProps): Promise<number | undefined> => {
  /*
    Position top-right of the user's browser window WHEN we can. From the
    MV3 service worker, windows.getCurrent may resolve to a window without
    bounds (or throw) depending on what's focused — the old unconditional
    `cLeft + width - 354` then produced NaN, windows.create rejected the
    bounds, and the approval window silently never opened. Bounds are now
    best-effort: no numbers, no positioning — Chrome places the popup.
  */
  let top: number | undefined;
  let left: number | undefined;
  try {
    const current = (await browserWindowsGetCurrent({
      windowTypes: ["normal"],
    })) as any;
    if (
      current &&
      typeof current.top === "number" &&
      typeof current.left === "number" &&
      typeof current.width === "number"
    ) {
      top = current.top + BROWSER_HEADER;
      left = current.left + current.width - WINDOW_SIZE.width;
    }
  } catch {
    // no usable current window — let Chrome pick the position
  }
  const positioned =
    top !== undefined &&
    left !== undefined &&
    Number.isFinite(top) &&
    Number.isFinite(left);

  const win = await browserWindowsCreate({
    focused: true,
    url,
    type: "popup",
    ...(positioned ? { top, left } : {}),
    ...WINDOW_SIZE,
    ...rest,
  });

  // shim firefox
  if (positioned && win.left !== left && win.id !== undefined) {
    await browserWindowsUpdate(win.id, { left, top });
  }
  return win.id;
};

export const remove = async (winId: number) => {
  return await browserWindowsRemove(winId);
};

export const openNotification = (
  { route, ...rest }: OpenNotificationProps = { route: "" }
): Promise<number | undefined> => {
  const url = `notification.html#${route}`;
  return create({ url, ...rest });
};
