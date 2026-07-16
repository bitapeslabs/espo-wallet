import i18n from "@/shared/locales/i18n";
import { useAppState } from "@/ui/states/appState";
import s from "./styles.module.scss";
import { ss } from "@/ui/utils";
import Tile from "@/ui/components/tile";

const Language = () => {
  const { updateAppState } = useAppState(ss(["updateAppState"]));

  const changeLanguage = async (lng: string) => {
    await i18n.changeLanguage(lng);
    await updateAppState({ language: lng });
  };

  const newLanguage = (lng: string) => {
    return async () => {
      await changeLanguage(lng);
    };
  };

  return (
    <div className={s.languages}>
      <Tile label="English" onClick={newLanguage("en")} />
      <Tile label="Русский" onClick={newLanguage("ru")} />
      <Tile label="中文" onClick={newLanguage("ch")} />
      <Tile label="한국어" onClick={newLanguage("kr")} />
    </div>
  );
};

export default Language;
