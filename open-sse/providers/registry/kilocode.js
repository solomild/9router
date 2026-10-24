export default {
  id: "kilocode",
  priority: 70,
  alias: "kc",
  uiAlias: "kc",
  display: {
    name: "Kilo Code",
    icon: "code",
    color: "#FF6B35",
    textIcon: "KC",
    website: "https://kilocode.ai",
    notice: {
      signupUrl: "https://kilocode.ai",
    },
  },
  category: "oauth",
  transport: {
    baseUrl: "https://api.kilo.ai/api/openrouter/chat/completions",
    headers: {},
    auth: {
      combined: true,
      header: "Authorization",
      scheme: "bearer",
      hooks: [
        "kilocodeOrg",
      ],
    },
  },
  models: [
    { id: "anthropic/claude-sonnet-4-20250514", name: "Claude Sonnet 4" },
    { id: "anthropic/claude-opus-4-20250514", name: "Claude Opus 4" },
    { id: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro" },
    { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash" },
    { id: "openai/gpt-4.1", name: "GPT-4.1" },
    { id: "openai/o3", name: "o3" },
    { id: "deepseek/deepseek-chat", name: "DeepSeek Chat" },
    { id: "deepseek/deepseek-reasoner", name: "DeepSeek Reasoner" },
  ],
  // The list above is a fallback, not the real catalogue: Kilo Code proxies
  // OpenRouter's namespace (400+ ids at the time of writing), which no static
  // registry entry list can keep up with. The live catalogue is served by
  // open-sse/services/kiloModels.js and reaches the model pickers through two
  // wires that must both exist:
  //   * a kilocode entry in PROVIDER_MODELS_CONFIG (/api/providers/[id]/models), and
  //   * "kilocode" in LIVE_CATALOG_PROVIDERS (src/shared/components/ModelSelectModal.js).
  // modelsFetcher alone only feeds the provider page's "Suggested free models"
  // row — it never enumerates the picker — so dropping either wire hides every
  // dynamic id (cohere/north-mini-code:free, poolside/laguna-m.1:free …).
  modelsFetcher: { url: "https://api.kilo.ai/api/gateway/models", type: "openrouter-free" },
  passthroughModels: true,
  oauth: {
    apiBaseUrl: "https://api.kilo.ai",
    initiateUrl: "https://api.kilo.ai/api/device-auth/codes",
    pollUrlBase: "https://api.kilo.ai/api/device-auth/codes",
  },
};
