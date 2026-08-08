import { useNavigate, useSearchParams } from "react-router-dom";
import type { ITokenSummary } from "@/shared/interfaces/api";
import TokenSearch from "@/ui/components/token-search";

/**
 * Token search tab: browses the trending whitelist / espo prefix search and
 * opens the tapped token's asset page. The query lives in the URL (?q=) so it
 * survives navigating into a token and pressing back.
 */
const Search = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("q") ?? "";

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

  return (
    <TokenSearch
      query={query}
      onQueryChange={(v) =>
        setSearchParams(v ? { q: v } : {}, { replace: true })
      }
      onSelect={open}
    />
  );
};

export default Search;
