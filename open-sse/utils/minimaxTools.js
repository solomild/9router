/**
 * MiniMax tool-schema compatibility shim.
 *
 * MiniMax rejects requests whose function tool declares no properties:
 *   400 "invalid params, function parameters is empty (2013)"
 * Any agent client that declares a no-argument tool (`advisor`, `cron_list`,
 * ...) trips it. The shim injects one optional string property so the schema
 * is non-empty. It is never added to `required`, so the model is not forced to
 * send a value back.
 *
 * Provider-independent on purpose: the rejection comes from the MiniMax model
 * regardless of which 9Router lane serves it (opencode free tier, OpenRouter
 * resellers such as kc/kilocode, direct api.minimax.io, OpenCode Go/Zen).
 */

/** MiniMax model ids this shim applies to. */
export function isMinimaxModel(model, body) {
  const candidate = model ?? body?.model ?? "";
  return /minimax/i.test(String(candidate));
}

/**
 * Resolve which schema field of `tool` carries the JSON schema.
 *
 * Three wire shapes reach the executors:
 *   - OpenAI chat      `{ type:"function", function:{ name, parameters } }`
 *   - Anthropic/Claude `{ name, description, input_schema }`
 *   - Responses/flat   `{ type:"function", name, parameters }`
 *
 * Picking the wrong key would inject a bogus `parameters` field into Claude
 * tools, so an explicit `input_schema` wins over the OpenAI-shaped defaults.
 * Unknown shapes are left untouched rather than given an invented schema.
 */
function schemaSlotOf(tool) {
  if (tool.function && typeof tool.function === "object" && !Array.isArray(tool.function)) {
    return { target: tool.function, key: "parameters" };
  }
  if ("input_schema" in tool) return { target: tool, key: "input_schema" };
  if ("parameters" in tool || tool.type === "function") return { target: tool, key: "parameters" };
  return null;
}

/**
 * Give every empty tool schema in `body.tools` one optional property.
 *
 * No-op when `body.tools` is absent, non-array, or already non-empty.
 */
export function sanitizeMinimaxTools(body) {
  if (!body || typeof body !== "object" || !Array.isArray(body.tools)) return;

  for (const tool of body.tools) {
    if (!tool || typeof tool !== "object" || Array.isArray(tool)) continue;

    const slot = schemaSlotOf(tool);
    if (!slot) continue;

    let params = slot.target[slot.key];
    if (!params || typeof params !== "object" || Array.isArray(params)) {
      params = { type: "object", properties: {} };
      slot.target[slot.key] = params;
    }

    const props = params.properties;
    const isEmpty = !props
      || typeof props !== "object"
      || Array.isArray(props)
      || Object.keys(props).length === 0;
    if (!isEmpty) continue;

    params.type = params.type || "object";
    params.properties = {
      _placeholder: {
        type: "string",
        description: "Compatibility parameter for models requiring non-empty schema; leave empty or omit.",
      },
    };
  }
}