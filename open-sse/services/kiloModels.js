// Kilo Code (kc) proxies the OpenRouter catalogue, so the ~8 ids hardcoded in
// registry/kilocode.js can never name what the gateway actually serves (400+ at
// the time of writing). This module is the single fetch path for that live
// catalogue: /api/providers/[id]/models feeds it to the model picker, and
// /api/providers/kilo/free-models filters it for the provider page. Two callers,
// one cache, one shape — they cannot disagree about which models exist.
//
// The endpoint is public and account-independent, so no token is attached and no
// refresh-on-401 path is needed.
import { proxyAwareFetch } from "../utils/proxyFetch.js";

export const KILO_MODELS_URL = "https://api.kilo.ai/api/gateway/models";

const FETCH_TIMEOUT_MS = 10000;
const CACHE_TTL_MS = 60 * 60 * 1000;

/** @type {{ models: object[], fetchedAt: number }|null} */
let cached = null;

export function normalizeKiloModel(item) {
  if (!item || typeof item !== "object") return null;
  const id = typeof item.id === "string" ? item.id.trim() : "";
  if (!id) return null;
  const name = typeof item.name === "string" && item.name.trim() ? item.name : id;
  // top_provider.context_length is the gateway's own limit; context_length is the
  // model's. Prefer the flat field, fall back to the provider row.
  const contextLength = Number(item.context_length) || Number(item.top_provider?.context_length) || 0;
  return { id, name, contextLength, isFree: item.isFree === true };
}

// Dedupe by id: the gateway lists the same weights twice (`foo` and `foo:free`
// are distinct ids, but a repeated id would render two identical picker rows).
export function parseKiloCatalog(payload) {
  const rows = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload) ? payload : [];
  const seen = new Set();
  const models = [];
  for (const row of rows) {
    const model = normalizeKiloModel(row);
    if (!model || seen.has(model.id)) continue;
    seen.add(model.id);
    models.push(model);
  }
  return models;
}

/**
 * @param {{forceRefresh?: boolean, log?: {warn?: Function}}} [options]
 * @returns {Promise<{ models: object[], cached: boolean, warning?: string }>}
 */
export async function resolveKiloCatalog(options = {}) {
  const now = Date.now();
  if (!options.forceRefresh && cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    return { models: cached.models, cached: true };
  }

  try {
    const response = await proxyAwareFetch(KILO_MODELS_URL, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    }, null);
    if (!response.ok) throw new Error(`Kilo models API returned ${response.status}`);
    const models = parseKiloCatalog(await response.json());
    // An empty catalogue is a failure, not a truth: serving it would blank every
    // Kilo picker until the TTL expires.
    if (models.length === 0) throw new Error("Kilo models API returned no models");
    cached = { models, fetchedAt: Date.now() };
    return { models, cached: false };
  } catch (error) {
    const warning = error?.message || String(error);
    options.log?.warn?.("KILO_MODELS", warning);
    // Serve the last good catalogue when the gateway is down or unreachable.
    if (cached) return { models: cached.models, cached: true, warning };
    return { models: [], cached: false, warning };
  }
}

// Test seam only — clears the module cache between cases.
export function resetKiloCatalogCache() {
  cached = null;
}
