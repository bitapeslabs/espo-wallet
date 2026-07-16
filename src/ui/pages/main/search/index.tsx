import { t } from "i18next";
import s from "../swap/styles.module.scss";

/** Placeholder: search is not wired up yet. */
const Search = () => {
  return (
    <div className={s.placeholder}>
      <h1>{t("nav.search")}</h1>
    </div>
  );
};

export default Search;
