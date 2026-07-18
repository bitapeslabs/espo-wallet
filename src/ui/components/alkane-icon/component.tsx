import { FC, useEffect, useState } from "react";
import { alkaneIconUrl } from "@/shared/utils/alkanes";

interface Props {
  /** Alkane id "block:tx". */
  id: string;
  /** Symbol/ticker, used for the letter fallback. */
  symbol: string;
}

/**
 * Alkane token icon from the ordiscan CDN, falling back to a letter avatar
 * when the image is missing or blocked. Renders inside an `.alk-icon-wrap`.
 */
const AlkaneIcon: FC<Props> = ({ id, symbol }) => {
  const url = alkaneIconUrl(id);
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [url]);

  if (failed || !url) {
    return (
      <span className="alk-icon-letter">
        {(symbol || "?").slice(0, 1).toUpperCase()}
      </span>
    );
  }

  return (
    <img
      className="alk-icon-img"
      src={url}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
};

export default AlkaneIcon;
