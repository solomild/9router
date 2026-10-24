// Live-catalog wiring for Kilo Code (kc):
//   GET /api/providers/[connectionId]/models → resolveKiloCatalog → picker rows
//
// Self-isolating: DATA_DIR points at a temp dir so seeding never touches ~/.9router.
// The gateway catalogue is fetched through proxyAwareFetch, which captures the
// native fetch at import time — so the module is mocked, not globalThis.fetch.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const stub = vi.hoisted(() => {
  const nativeFetch = globalThis.fetch.bind(globalThis);
  return { mode: "ok", calls: [], nativeFetch };
});

vi.mock("open-sse/utils/proxyFetch.js", () => ({
  proxyAwareFetch: async (url, options) => {
    stub.calls.push(String(url));
    if (stub.mode === "down") return new Response("boom", { status: 500 });
    if (stub.mode === "empty") return Response.json({ data: [] });
    return Response.json(stub.catalog);
  },
  default: async (url, options) => stub.nativeFetch(url, options),
}));

// Shape mirrors api.kilo.ai/api/gateway/models (OpenRouter-style, 400+ rows live).
stub.catalog = {
  data: [
    {
      id: "nvidia/nemotron-3.5-super-vl:free",
      name: "NVIDIA: Nemotron 3.5 Super VL (free)",
      isFree: true,
      context_length: 1000000,
      architecture: { input_modalities: ["text", "image", "video"], output_modalities: ["text"] },
    },
    {
      id: "moonshotai/kimi-k2.5",
      name: "Kimi K2.5",
      isFree: false,
      context_length: 262144,
      architecture: { input_modalities: ["text"], output_modalities: ["text"] },
    },
    { id: "nvidia/nemotron-3.5-super-vl:free", name: "duplicate row", isFree: true, context_length: 1 },
    { name: "no id at all", context_length: 4096 },
  ],
};

const originalDataDir = process.env.DATA_DIR;
let GET;
let createProviderConnection;
let resolveKiloCatalog;
let resetKiloCatalogCache;
let parseKiloCatalog;

beforeAll(async () => {
  process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "9router-kilo-live-"));
  vi.resetModules();
  ({ GET } = await import("@/app/api/providers/[id]/models/route.js"));
  ({ createProviderConnection } = await import("@/models/index.js"));
  ({ resolveKiloCatalog, resetKiloCatalogCache, parseKiloCatalog } = await import("open-sse/services/kiloModels.js"));
});

afterAll(() => {
  fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
  if (originalDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = originalDataDir;
});

beforeEach(() => {
  stub.mode = "ok";
  stub.calls.length = 0;
  resetKiloCatalogCache();
});

async function seedKilocode(tag) {
  return createProviderConnection({
    provider: "kilocode",
    authType: "oauth",
    accessToken: `tok-kilo-${tag}-${Date.now()}`,
    email: `kilo-live-${tag}-${Date.now()}@example.com`,
    providerSpecificData: {},
    testStatus: "active",
  });
}

async function getModels(connectionId) {
  const req = new Request(`http://localhost/api/providers/${connectionId}/models`);
  return GET(req, { params: Promise.resolve({ id: connectionId }) });
}

describe("criterion 1 — the live Kilo catalogue reaches /api/providers/[id]/models", () => {
  it("returns the dynamic ids the 8-entry registry fallback cannot name", async () => {
    const conn = await seedKilocode("a");
    const res = await getModels(conn.id);
    expect(res.status).toBe(200);
    const data = await res.json();
    const ids = data.models.map((m) => m.id);
    expect(ids).toContain("nvidia/nemotron-3.5-super-vl:free");
    expect(ids).toContain("moonshotai/kimi-k2.5");
    const nemotron = data.models.find((m) => m.id === "nvidia/nemotron-3.5-super-vl:free");
    expect(nemotron.name).toBe("NVIDIA: Nemotron 3.5 Super VL (free)");
    expect(nemotron.contextLength).toBe(1000000);
    expect(nemotron.isFree).toBe(true);
  });

  it("never sends the account token to the public catalogue endpoint", async () => {
    const conn = await seedKilocode("b");
    await getModels(conn.id);
    expect(stub.calls).toEqual(["https://api.kilo.ai/api/gateway/models"]);
    const body = JSON.stringify(await (await getModels(conn.id)).json());
    expect(body).not.toContain(conn.accessToken);
    expect(body).not.toContain("tok-kilo");
  });
});

describe("criterion 2 — catalog normalization", () => {
  it("drops rows without an id and collapses repeated ids", () => {
    const parsed = parseKiloCatalog(stub.catalog);
    expect(parsed.map((m) => m.id)).toEqual([
      "nvidia/nemotron-3.5-super-vl:free",
      "moonshotai/kimi-k2.5",
    ]);
    // First row wins: the duplicate carries a truncated context_length.
    expect(parsed[0].contextLength).toBe(1000000);
  });

  it("tolerates non-array payloads and non-object rows", () => {
    expect(parseKiloCatalog(null)).toEqual([]);
    expect(parseKiloCatalog({ data: "nope" })).toEqual([]);
    expect(parseKiloCatalog([null, 7, { id: "ok" }]).map((m) => m.id)).toEqual(["ok"]);
  });

  it("falls back to the id when the gateway omits a display name", () => {
    expect(parseKiloCatalog({ data: [{ id: "vendor/model-x" }] })[0].name).toBe("vendor/model-x");
  });
});

describe("criterion 3 — cache and failure never blank the picker", () => {
  it("serves one upstream call for repeated requests", async () => {
    await resolveKiloCatalog();
    await resolveKiloCatalog();
    expect(stub.calls.length).toBe(1);
  });

  it("re-fetches on forceRefresh", async () => {
    await resolveKiloCatalog();
    const fresh = await resolveKiloCatalog({ forceRefresh: true });
    expect(stub.calls.length).toBe(2);
    expect(fresh.models.length).toBe(2);
  });

  it("upstream 5xx → empty list plus a warning (the caller keeps the static fallback)", async () => {
    stub.mode = "down";
    const result = await resolveKiloCatalog({ log: { warn() {} } });
    expect(result.models).toEqual([]);
    expect(result.warning).toMatch(/500/);
  });

  it("an empty catalogue is a failure, not the truth", async () => {
    stub.mode = "empty";
    const result = await resolveKiloCatalog({ log: { warn() {} } });
    expect(result.models).toEqual([]);
    expect(result.warning).toMatch(/no models/i);
  });

  it("keeps serving the last good catalogue when the gateway goes down", async () => {
    const first = await resolveKiloCatalog();
    expect(first.models.length).toBe(2);
    stub.mode = "down";
    const second = await resolveKiloCatalog({ forceRefresh: true, log: { warn() {} } });
    expect(second.models.length).toBe(2);
    expect(second.cached).toBe(true);
    expect(second.warning).toMatch(/500/);
  });

  it("route surfaces the fallback as a warning, not a crash", async () => {
    stub.mode = "down";
    const conn = await seedKilocode("c");
    const res = await getModels(conn.id);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.models).toEqual([]);
    expect(data.warning).toBeTruthy();
  });
});
