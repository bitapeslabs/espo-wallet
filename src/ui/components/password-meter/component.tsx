import { FC } from "react";
import { t } from "i18next";
import {
  passwordStrength,
  strengthStep,
} from "@/shared/validators";

interface Props {
  password: string;
}

/** b8's live password strength meter: four segments plus a label. */
const PasswordMeter: FC<Props> = ({ password }) => {
  if (!password) return null;

  const step = strengthStep(passwordStrength(password));

  return (
    <div className="pw-meter">
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className="seg"
          style={i < step.segs ? { background: step.color } : undefined}
        />
      ))}
      <span className="pw-label" style={{ color: step.color }}>
        {t(`components.password_strength.${step.labelKey}`)}
      </span>
    </div>
  );
};

export default PasswordMeter;
