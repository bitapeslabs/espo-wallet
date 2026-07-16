import {
  Combobox,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
} from "@headlessui/react";
import { FC, useEffect, useRef, useState } from "react";
import { wordlists } from "bip39";
import cn from "classnames";

import s from "./styles.module.scss";

const WORDS = wordlists.english;

export interface Props {
  selected?: string;
  setSelected: (value: string) => void;
  /** dom id set on this field's wrapper, for programmatic focus */
  inputId?: string;
  /** id of the next field's wrapper to focus when this word is committed */
  nextInputId?: string;
  /** whether the following input already holds a word */
  nextHasText?: boolean;
}

const inputInside = (id?: string) =>
  id
    ? (document.getElementById(id)?.querySelector("input") as
        | HTMLInputElement
        | null
        | undefined)
    : null;

// Move focus from `source` to `target`. headlessui keeps focus pinned to a
// combobox input while its dropdown is open, so we first send Escape to close
// the source dropdown, then focus the target (re-asserting once).
const advanceFocus = (
  source: HTMLInputElement | null | undefined,
  target: HTMLInputElement | null | undefined
) => {
  if (!target) return;
  source?.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
  );
  source?.blur();
  requestAnimationFrame(() => {
    target.focus({ preventScroll: true } as FocusOptions);
    requestAnimationFrame(() => {
      if (document.activeElement !== target) {
        target.focus({ preventScroll: true } as FocusOptions);
      }
    });
  });
};

const SelectWithHint: FC<Props> = ({
  selected,
  setSelected,
  inputId,
  nextInputId,
  nextHasText,
}) => {
  const [query, setQuery] = useState<string>(selected ?? "");
  const [filtered, setFiltered] = useState<string[]>([]);
  const [touched, setTouched] = useState(false);

  const wrapRef = useRef<HTMLDivElement>(null);
  // keep the latest props reachable from the native listener's closure
  const latest = useRef({ nextInputId, nextHasText });
  latest.current = { nextInputId, nextHasText };

  const getFiltered = (word: string) =>
    WORDS.filter((w) => w.startsWith(word.trim())).slice(0, 4);

  const commit = (value: string) => {
    setSelected(value);
    setQuery(value);
    setFiltered([]);
    const src = wrapRef.current?.querySelector("input");
    setTimeout(() => advanceFocus(src, inputInside(nextInputId)), 0);
  };

  const onInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const phrase = event.target.value.trim().toLowerCase();

    // whole phrase pasted into one input
    if (phrase.split(/\s+/).length === 12) {
      setSelected(phrase);
      setQuery(phrase);
      setFiltered([]);
      return;
    }

    const isWord = WORDS.includes(phrase);
    setQuery(phrase);
    setSelected(isWord ? phrase : "");
    const list = getFiltered(phrase);
    setFiltered(list.length === 1 && list[0] === phrase ? [] : list);
  };

  useEffect(() => {
    if (selected?.length) setQuery(selected);
  }, [selected]);

  // Native-level idle-advance. Raw DOM listeners fire regardless of React /
  // headlessui, and the debounce timer lives entirely in this closure so
  // nothing else can clear it. When the field holds a complete bip39 word and
  // 1000ms pass with NO activity (no typing, no arrow-navigation of the
  // dropdown, no hovering a suggestion), focus jumps to the next empty field.
  // Any of those interactions restarts the countdown, so the auto-advance
  // never commits the typed word while the user is still choosing.
  useEffect(() => {
    const wrap = wrapRef.current;
    const input = wrap?.querySelector("input");
    if (!wrap || !input) return;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const arm = () => {
      if (timer) clearTimeout(timer);
      const word = input.value.trim().toLowerCase();
      const { nextInputId: nid, nextHasText: nht } = latest.current;
      if (!nid || nht || !WORDS.includes(word)) return;
      timer = setTimeout(() => {
        if (document.activeElement === input) {
          advanceFocus(input, inputInside(nid));
        }
      }, 1000);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      // arrow / navigation keys mean the user is browsing the suggestions
      if (
        e.key === "ArrowDown" ||
        e.key === "ArrowUp" ||
        e.key === "Home" ||
        e.key === "End" ||
        e.key === "PageUp" ||
        e.key === "PageDown"
      ) {
        arm();
      }
    };

    const onOptionHover = (e: Event) => {
      // hovering a suggestion (anything in the dropdown, not the input itself)
      if (e.target !== input && !input.contains(e.target as Node)) arm();
    };

    input.addEventListener("input", arm);
    input.addEventListener("keydown", onKeyDown);
    wrap.addEventListener("mouseover", onOptionHover);
    return () => {
      if (timer) clearTimeout(timer);
      input.removeEventListener("input", arm);
      input.removeEventListener("keydown", onKeyDown);
      wrap.removeEventListener("mouseover", onOptionHover);
    };
  }, []);

  const isInvalid =
    touched && query.trim() !== "" && !WORDS.includes(query.trim());

  return (
    <Combobox
      value={selected ?? ""}
      onChange={(v: string) => {
        if (v) commit(v);
      }}
      nullable
    >
      <div className={s.wrap} id={inputId} ref={wrapRef}>
        <div className={s.inputBox}>
          <ComboboxInput
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            className={cn(s.input, { [s.error]: isInvalid })}
            displayValue={(word: string) => word}
            onChange={onInputChange}
            onBlur={() => setTouched(true)}
            value={query}
          />
        </div>
        <ComboboxOptions className={s.optionsBox}>
          {filtered.length === 0 && query !== "" ? (
            <></>
          ) : (
            filtered.map((word) => (
              <ComboboxOption
                key={word}
                className={({ active }) =>
                  cn(s.options, { [s.optionsActive]: active })
                }
                value={word}
              >
                {({ selected: isSel }) => (
                  <span
                    className={cn(s.optionWord, {
                      [s.optionSelected]: isSel,
                    })}
                  >
                    {word}
                  </span>
                )}
              </ComboboxOption>
            ))
          )}
        </ComboboxOptions>
      </div>
    </Combobox>
  );
};

export default SelectWithHint;
