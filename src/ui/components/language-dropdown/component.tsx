import { useEffect, useRef, useState } from "react";
import cn from "classnames";
import i18n from "@/shared/locales/i18n";
import { useAppState } from "@/ui/states/appState";
import { ss } from "@/ui/utils";
import {
  CaretDownIcon,
  CheckIcon,
  GlobeBoldIcon,
} from "@/ui/icons/phosphor";
import s from "./styles.module.scss";

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "ch", label: "中文" },
  { code: "ru", label: "Русский" },
  { code: "kr", label: "한국어" },
];

/** Compact language switcher (espo dropdown), used on the guest screens. */
const LanguageDropdown = () => {
  const { language, updateAppState } = useAppState(
    ss(["language", "updateAppState"])
  );
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const changeLanguage = async (lng: string) => {
    if (lng === language) {
      setOpen(false);
      return;
    }
    await i18n.changeLanguage(lng);
    await updateAppState({ language: lng });
    setOpen(false);
  };

  const currentLang =
    LANGUAGES.find((l) => l.code === language) ?? LANGUAGES[0];

  return (
    <div
      className={cn("dropdown", s.langDropdown)}
      data-open={open ? "1" : "0"}
      ref={rootRef}
    >
      <button
        type="button"
        className={cn("dropdown-trigger", s.langTrigger)}
        onClick={() => setOpen((p) => !p)}
      >
        <GlobeBoldIcon size={17} />
        <span className="dropdown-label">{currentLang.label}</span>
        <span className="dropdown-caret">
          <CaretDownIcon size={13} />
        </span>
      </button>
      <div className={cn("dropdown-panel", s.langPanel)}>
        {LANGUAGES.map((l) => (
          <button
            type="button"
            key={l.code}
            className={cn("dropdown-item", {
              selected: l.code === currentLang.code,
            })}
            onClick={async () => await changeLanguage(l.code)}
          >
            {l.code === currentLang.code ? <CheckIcon size={13} /> : undefined}
            <span className="dropdown-label">{l.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default LanguageDropdown;
