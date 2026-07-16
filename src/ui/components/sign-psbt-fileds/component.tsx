import { FC } from "react";

import { IField } from "@/shared/interfaces/provider";
import { t } from "i18next";
import cn from "classnames";
import { WarningIcon } from "@/ui/icons/phosphor";
import s from "./styles.module.scss";

interface SignPsbtFiledsProps {
  fields: IField[];
  setModalInputIndexHandler: (value: number) => void;
}

const SignPsbtFileds: FC<SignPsbtFiledsProps> = ({
  fields,
  setModalInputIndexHandler,
}) => {
  return (
    <div className={s.list}>
      {fields.map((f, i) => (
        <div
          key={i}
          className={cn("review-card", { [s.important]: f.important })}
        >
          <div className={s.head}>
            <span className="stat-label">{f.label}</span>
            {f.important && f.input ? (
              <span className={s.toSign}>{t("provider.to_sign")}</span>
            ) : undefined}
            {f.value.anyonecanpay && f.important && (
              <WarningIcon
                size={18}
                className={s.warn}
                onClick={() => {
                  setModalInputIndexHandler(i);
                }}
              />
            )}
          </div>
          <div className="stat-value">
            <p>
              {f.input ? t("provider.utxo_txid") : t("provider.to_address") + ": "}
              {f.value.text}
            </p>
            <p>
              {t("inscription_details.value") + ": "}
              {f.value.value}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
};

export default SignPsbtFileds;
