import s from "./styles.module.scss";
import config from "../../../../package.json";
import { FC, ReactNode } from "react";
import { browserTabsCreate } from "@/shared/utils/browser";
import { ESPO_URL } from "@/shared/constant";

interface SettingsLayoutProps {
  children: ReactNode;
}

const SettingsLayout: FC<SettingsLayoutProps> = ({ children }) => {
  return (
    <div className={s.wrapper}>
      <div className={s.settings}>{children}</div>
      <div className={s.version}>
        Version <span>{config.version}</span> |{" "}
        <a
          href="#"
          onClick={async () => {
            await browserTabsCreate({
              url: ESPO_URL,
              active: true,
            });
          }}
        >
          espo.sh
        </a>
      </div>
    </div>
  );
};

export default SettingsLayout;
