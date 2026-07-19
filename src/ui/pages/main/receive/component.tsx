import { useEffect, useRef, useState } from "react";
import QRCode from "qr-code-styling";
import s from "./styles.module.scss";
import { t } from "i18next";
import { useLocation } from "react-router-dom";
import cn from "classnames";
import { useGetCurrentAccount } from "@/ui/states/walletState";
import { CopyFillIcon, BitcoinBIcon } from "@/ui/icons/phosphor";
import AlkaneIcon from "@/ui/components/alkane-icon";
import type { IPortfolioAsset } from "@/shared/interfaces/api";

// 1x1 transparent gif: reserves the QR's centre (hideBackgroundDots clears the
// dots there) so the asset/BTC badge can be overlaid cleanly on top.
const TRANSPARENT_PX =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

// Dark QR data on the white card. Resolved from --panel3 at runtime; this is
// the static fallback so the module-level instance has a concrete colour.
const QR_DATA_FALLBACK = "#1f2228";

const qrCode = new QRCode({
  width: 250,
  height: 250,
  type: "svg",
  margin: 0,
  image: TRANSPARENT_PX,
  // Purely rectangular render: square dots and square finder patterns.
  dotsOptions: { type: "square", color: QR_DATA_FALLBACK },
  cornersSquareOptions: { type: "square", color: QR_DATA_FALLBACK },
  cornersDotOptions: { type: "square", color: QR_DATA_FALLBACK },
  backgroundOptions: {
    color: "#ffffff00",
  },
  imageOptions: {
    crossOrigin: "anonymous",
    margin: 0,
    imageSize: 0.34,
  },
});

const Receive = () => {
  const currentAccount = useGetCurrentAccount();
  const location = useLocation();
  const ref = useRef(null);

  const receiveAsset = location.state?.receiveAsset as
    | IPortfolioAsset
    | undefined;
  // The centre badge is the token icon only for an alkane; BTC (and the home
  // account view) show the Bitcoin glyph on a white tile.
  const isTokenCenter = !!receiveAsset && receiveAsset.id !== "btc";
  const address = currentAccount?.address;

  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(copiedTimer.current), []);

  useEffect(() => {
    if (ref.current) qrCode.append(ref.current);
    // Colour the QR data like the page background (dark on the white card).
    const bg = getComputedStyle(document.documentElement)
      .getPropertyValue("--panel3")
      .trim();
    if (bg) {
      qrCode.update({
        dotsOptions: { type: "square", color: bg },
        cornersSquareOptions: { type: "square", color: bg },
        cornersDotOptions: { type: "square", color: bg },
      });
    }
  }, []);

  useEffect(() => {
    qrCode.update({ data: address });
  }, [address]);

  const onCopy = async () => {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    // Flip the button label to "Copied" for a second, then back.
    setCopied(true);
    clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), 1000);
  };

  return (
    <div className={s.receive}>
      <div className={s.qrCard}>
        <div className={s.qrWrap}>
          <div className={s.qr} ref={ref} />
          <div
            className={cn(s.qrCenter, {
              [s.qrCenterToken]: isTokenCenter,
              [s.qrCenterBtc]: !isTokenCenter,
            })}
          >
            {isTokenCenter ? (
              <AlkaneIcon id={receiveAsset!.id} symbol={receiveAsset!.symbol} />
            ) : (
              <BitcoinBIcon />
            )}
          </div>
        </div>
      </div>

      <div className={s.addressGroup}>
        <div className={cn("panel", s.addressCard)}>
          <div className={s.address}>{address}</div>
        </div>
        <button className={cn("btn", s.copyBtn)} onClick={onCopy}>
          {copied ? undefined : <CopyFillIcon size={15} />}
          <span>{copied ? t("receive.copied") : t("receive.copy")}</span>
        </button>
      </div>

      <p className={s.disclaimer}>{t("receive.disclaimer")}</p>
    </div>
  );
};

export default Receive;
