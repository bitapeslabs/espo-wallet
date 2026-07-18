import { useEffect, useState } from "react";
import { t } from "i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import { TailSpin } from "react-loading-icons";
import { useControllersState } from "@/ui/states/controllerState";
import { ss } from "@/ui/utils";
import { useEspoQuery } from "@/ui/utils/query";
import type { ITokenSummary } from "@/shared/interfaces/api";
import TokenCard from "@/ui/components/token-card";
import { MagnifyingGlassBoldIcon } from "@/ui/icons/phosphor";
import s from "./styles.module.scss";

/**
 * Token search: with an empty query it shows the trending whitelist (ranked by
 * volume, top-3 medalled); typing a prefix swaps in espo's prefix search
 * results. Tapping a card opens that token's asset page.
 */
const Search = () => {
  const { apiController } = useControllersState(ss(["apiController"]));
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // The query lives in the URL (?q=) so it survives navigating into a token and
  // pressing back (the tab remounts, but the URL — and thus the text — persist).
  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");

  const onQueryChange = (value: string) => {
    setQuery(value);
    setSearchParams(value ? { q: value } : {}, { replace: true });
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

  // Pass a portfolio-shaped row so the asset page shows the token's name /
  // symbol / price even when it isn't in the user's holdings.
  const open = (tok: ITokenSummary) =>
    navigate(`/asset/${encodeURIComponent(tok.id)}`, {
      state: {
        alkane: {
          id: tok.id,
          name: tok.name,
          symbol: tok.symbol,
          balance: "0",
          priceUsd: tok.priceUsd,
          valueUsd: null,
          change24h: tok.change24h,
          valueChangeUsd24h: null,
        },
      },
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
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={t("search.placeholder")}
          autoFocus
          spellCheck={false}
          autoComplete="off"
        />
      </div>

      <h2 className={s.title}>
        {q ? `${t("search.results_for")} "${q}"` : t("search.trending")}
      </h2>

      {loading ? (
        <div className={s.loader}>
          <TailSpin className="animate-spin" />
        </div>
      ) : list.length ? (
        <div className={s.list}>
          {list.map((tok, i) => (
            <TokenCard
              key={tok.id}
              token={tok}
              rank={q ? undefined : i + 1}
              onClick={() => open(tok)}
            />
          ))}
        </div>
      ) : (
        <div className={s.empty}>{t("search.no_results")}</div>
      )}
    </div>
  );
};

export default Search;
