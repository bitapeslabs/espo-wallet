import { FC } from "react";

interface Props {
  size?: number;
  withName?: boolean;
}

/** Espo Wallet brand mark: the wallet icon plus the wordmark. */
const Brand: FC<Props> = ({ size = 44, withName = true }) => {
  return (
    <div className="brand">
      <img
        src="/espo-icon.svg"
        width={size}
        height={size}
        alt="Espo Wallet"
        style={{ borderRadius: Math.round(size * 0.19) }}
      />
      {withName ? <span className="brand-name">Espo Wallet</span> : undefined}
    </div>
  );
};

export default Brand;
