import { FC, useEffect, useState } from "react";
import { t } from "i18next";
import { TailSpin } from "react-loading-icons";
import { useControllersState } from "@/ui/states/controllerState";
import { useAppState } from "@/ui/states/appState";
import { ss } from "@/ui/utils";
import { useEspoQuery } from "@/ui/utils/query";
import type { ITokenSummary } from "@/shared/interfaces/api";
import TokenCard from "@/ui/components/token-card";
import { MagnifyingGlassBoldIcon } from "@/ui/icons/phosphor";
import cn from "classnames";
import s from "./styles.module.scss";

interface Props {
  /** Called when a token card is tapped. */
  onSelect: (token: ITokenSummary) => void;
  /**
   * Rows pinned above the results (e.g. BTC on the swap asset picker). They are
   * filtered by the query like everything else so search still narrows them.
   */
  pinned?: ITokenSummary[];
  /** Controlled query (the Search tab keeps it in the URL); else local state. */
  query?: string;
  onQueryChange?: (value: string) => void;
  autoFocus?: boolean;
}

/**
 * The token browser used by both the Search tab and the swap asset picker: an
 * empty query shows the trending whitelist (top-3 medalled), typing a prefix
 * swaps in espo's search results. The consumer decides what tapping a card does.
 */
const TokenSearch: FC<Props> = ({
  onSelect,
  pinned,
  query: controlledQuery,
  onQueryChange,
  autoFocus = true,
}) => {
  const { apiController } = useControllersState(ss(["apiController"]));
  const { network } = useAppState(ss(["network"]));
  const [localQuery, setLocalQuery] = useState("");

  const query = controlledQuery ?? localQuery;
  const setQuery = (v: string) => {
    if (onQueryChange) onQueryChange(v);
    else setLocalQuery(v);
  };

  const q = query.trim();

  // Debounce what actually drives the (height-versioned) search query.
  const [debouncedQ, setDebouncedQ] = useState(q);
  useEffect(() => {
    const h = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(h);
  }, [q]);

  const trendingQuery = useEspoQuery(
    ["trending"],
    () => apiController.getTrendingTokens(),
    { enabled: !q }
  );
  const searchQuery = useEspoQuery(
    ["search-tokens", debouncedQ],
    () => apiController.searchTokens(debouncedQ),
    { enabled: !!debouncedQ }
  );

  const pinnedRows = (pinned ?? []).filter((tok) => {
    if (!q) return true;
    const needle = q.toLowerCase();
    return (
      tok.symbol.toLowerCase().includes(needle) ||
      tok.name.toLowerCase().includes(needle)
    );
  });

  const list = (q ? searchQuery.data : trendingQuery.data) ?? [];
  const loading = q
    ? debouncedQ !== q || searchQuery.isFetching || searchQuery.data === undefined
    : trendingQuery.data === undefined;

  return (
    <div className={s.search}>
      <div className={s.bar}>
        <MagnifyingGlassBoldIcon size={18} className={s.barIcon} />
        <input
          className={s.input}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("search.placeholder")}
          autoFocus={autoFocus}
          spellCheck={false}
          autoComplete="off"
        />
      </div>

      {/* with no query the pinned rows (BTC, frBTC, held tokens) sit ABOVE
          the Trending header; while searching they join the results below */}
      {!q && pinnedRows.length ? (
        <div className={s.pinnedTop}>
          {pinnedRows.map((tok) => (
            <TokenCard
              key={`pinned-${tok.id}`}
              token={tok}
              network={network}
              onClick={() => onSelect(tok)}
            />
          ))}
        </div>
      ) : undefined}

      <h2 className={s.title}>
        {q ? `${t("search.results_for")} "${q}"` : t("search.trending")}
      </h2>

      {q && pinnedRows.length ? (
        <div className={s.list}>
          {pinnedRows.map((tok) => (
            <TokenCard
              key={`pinned-${tok.id}`}
              token={tok}
              network={network}
              onClick={() => onSelect(tok)}
            />
          ))}
        </div>
      ) : undefined}

      {loading ? (
        <div className={s.loader}>
          <TailSpin className="animate-spin" />
        </div>
      ) : list.length ? (
        <div
          className={cn(s.list, {
            [s.listBelowPinned]: !!q && pinnedRows.length > 0,
          })}
        >
          {list.map((tok, i) => (
            <TokenCard
              key={tok.id}
              token={tok}
              network={network}
              rank={q ? undefined : i + 1}
              onClick={() => onSelect(tok)}
            />
          ))}
        </div>
      ) : pinnedRows.length ? undefined : (
        <div className={s.empty}>{t("search.no_results")}</div>
      )}
    </div>
  );
};

export default TokenSearch;
