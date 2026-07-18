import browser from "./browser";

export const t = (name: string) => browser.i18n.getMessage(name);

export const format = (str: string, ...args: any[]) => {
  return args.reduce((m, n) => m.replace("_s_", n), str);
};

export interface fetchProps extends RequestInit {
  method?: "POST" | "GET" | "PUT" | "DELETE";
  headers?: HeadersInit;
  path: string;
  params?: Record<string, string>;
  error?: boolean;
  json?: boolean;
  baseUrl: string;
}

export const customFetch = async <T>({
  path,
  json = true,
  baseUrl,
  ...props
}: fetchProps): Promise<T | undefined> => {
  const url = `${baseUrl}${path}`;
  const params = props.params
    ? Object.entries(props.params)
        .map((k) => `${k[0]}=${k[1]}`)
        .join("&")
    : "";
  const res = await fetch(
    `${url.toString()}${Number(params.length) > 0 ? "?" : ""}${params ?? ""}`,
    { ...props, cache: "no-store" }
  );

  if (!res.ok) return;
  if (!json) return (await res.text()) as T;

  return await res.json();
};

export interface JsonRpcErrorShape {
  code: number;
  message: string;
  data?: unknown;
}

export class EspoRpcError extends Error {
  code?: number;
  data?: unknown;
  constructor(message: string, code?: number, data?: unknown) {
    super(message);
    this.name = "EspoRpcError";
    this.code = code;
    this.data = data;
  }
}

let rpcRequestId = 0;

/**
 * Call an espo JSON-RPC 2.0 endpoint (POST {rpcUrl}). `params` is sent verbatim
 * as the request `params`; espo module methods expect a named-key object, root
 * methods either ignore params or take a small object. Returns the raw `result`.
 * Throws {@link EspoRpcError} on transport failure or a JSON-RPC `error` object.
 * In-band failures (module methods returning `{ ok: false, error }`) are NOT
 * thrown here; callers inspect the `ok` field.
 */
export const espoRpc = async <T>(
  rpcUrl: string,
  method: string,
  params: Record<string, unknown> = {}
): Promise<T> => {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: ++rpcRequestId,
      method,
      params,
    }),
  });

  if (!res.ok) {
    throw new EspoRpcError(`espo rpc http ${res.status}`, res.status);
  }

  const body = (await res.json()) as {
    result?: T;
    error?: JsonRpcErrorShape;
  };

  if (body.error) {
    throw new EspoRpcError(
      body.error.message || "espo rpc error",
      body.error.code,
      body.error.data
    );
  }

  return body.result as T;
};

/**
 * Send many espo RPC calls in a single JSON-RPC 2.0 batch request. Returns the
 * results in the SAME order as `calls`; a per-call error or missing response
 * yields `undefined` for that slot (the batch itself only throws on transport /
 * HTTP failure).
 */
export const espoRpcBatch = async <T = unknown>(
  rpcUrl: string,
  calls: { method: string; params?: Record<string, unknown> }[]
): Promise<(T | undefined)[]> => {
  if (!calls.length) return [];
  const body = calls.map((c, i) => ({
    jsonrpc: "2.0",
    id: i,
    method: c.method,
    params: c.params ?? {},
  }));
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new EspoRpcError(`espo rpc http ${res.status}`, res.status);
  }
  const arr = (await res.json()) as {
    id?: number;
    result?: T;
    error?: unknown;
  }[];
  const out: (T | undefined)[] = new Array(calls.length).fill(undefined);
  for (const r of Array.isArray(arr) ? arr : []) {
    if (
      typeof r.id === "number" &&
      r.id >= 0 &&
      r.id < calls.length &&
      !r.error
    ) {
      out[r.id] = r.result;
    }
  }
  return out;
};

export const excludeKeysFromObj = <
  T extends Record<string, any>,
  K extends keyof T
>(
  obj: T,
  keysToExtract: K[]
): Omit<T, K> => {
  return Object.fromEntries(
    Object.entries(obj).filter(([k]) => !keysToExtract.includes(k as K))
  ) as Omit<T, K>;
};

export const pickKeysFromObj = <
  T extends Record<string, any>,
  K extends keyof T
>(
  obj: T,
  keysToPick: K[]
): Pick<T, K> => {
  return Object.fromEntries(
    Object.entries(obj).filter(([k]) => keysToPick.includes(k as K))
  ) as Pick<T, K>;
};

export const parseLocation = (
  location: string
): {
  txid: string;
  vout: number;
  offset: number;
} => {
  const [txid, vout, offset] = location.split("i");

  return {
    txid,
    vout: Number(vout),
    offset: Number(offset),
  };
};
