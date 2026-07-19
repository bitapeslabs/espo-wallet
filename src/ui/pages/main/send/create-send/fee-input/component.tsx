import cn from "classnames";
import { FC, useEffect, useMemo, useState } from "react";
import s from "./styles.module.scss";
import { t } from "i18next";
import { useAppState } from "@/ui/states/appState";
import { useTransactionManagerContext } from "@/ui/utils/tx-ctx";
import { DEFAULT_FEES } from "@/shared/constant";
import { ss } from "@/ui/utils";
import InputNumber from "@/ui/components/input-number";

interface Props {
  onChange: (value?: number) => void;
  value?: number;
}

const MAX_FEE = 200_000;

/** Card index for the custom (manual) fee input. */
const CUSTOM_INDEX = 2;

const FeeInput: FC<Props> = ({ onChange, value }) => {
  const { feeRates } = useTransactionManagerContext();
  // Track the selected CARD by index, not by fee value — two presets can share
  // the same sat/vB (e.g. a quiet mempool), and selecting by value would light
  // up both cards at once.
  const [selectedIdx, setSelectedIdx] = useState<number>(0);

  const cards = useMemo(
    () => [
      {
        title: t("send.create_send.fee_input.slow"),
        description: `${feeRates?.slow ?? DEFAULT_FEES.slow} sat/Vb`,
        value: feeRates?.slow ?? DEFAULT_FEES.slow,
      },
      {
        title: t("send.create_send.fee_input.fast"),
        description: `${feeRates?.fast ?? DEFAULT_FEES.fast} sat/Vb`,
        value: feeRates?.fast ?? DEFAULT_FEES.fast,
      },
      {
        title: t("send.create_send.fee_input.custom"),
        description: "",
        value: undefined,
      },
    ],
    [feeRates]
  );

  const onSelect = (idx: number) => {
    setSelectedIdx(idx);
    if (idx !== CUSTOM_INDEX) onChange(cards[idx].value);
  };

  // When fees refresh, keep the current preset selected but push its new value.
  useEffect(() => {
    if (selectedIdx !== CUSTOM_INDEX) onChange(cards[selectedIdx].value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feeRates]);

  return (
    <div className={s.container}>
      <div className={s.cardWrapper}>
        {cards.map((f, i) => (
          <FeeCard
            key={i}
            description={f.description}
            title={f.title}
            onSelect={() => onSelect(i)}
            selected={i === selectedIdx}
          />
        ))}
      </div>
      {selectedIdx === CUSTOM_INDEX && (
        <InputNumber
          value={value}
          onChange={(value) => {
            onChange(value);
          }}
          onlyInt
          max={MAX_FEE}
        />
      )}
    </div>
  );
};

interface FeeCardProps {
  selected: boolean;
  onSelect: () => void;
  title: string;
  description: string;
}

const FeeCard: FC<FeeCardProps> = ({
  selected,
  onSelect,
  title,
  description,
}) => {
  const { language } = useAppState(ss(["language"]));

  return (
    <div
      className={cn(s.card, { [s.cardSelected]: selected })}
      onClick={onSelect}
    >
      <div className={cn(s.title, language === "ru" && s.russian)}>{title}</div>
      {description ? <div className={s.description}>{description}</div> : ""}
    </div>
  );
};

export default FeeInput;
