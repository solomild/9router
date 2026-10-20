import { describe, it, expect } from "vitest";
import { DefaultExecutor } from "../../open-sse/executors/default.js";
import { isMinimaxModel, sanitizeMinimaxTools } from "../../open-sse/utils/minimaxTools.js";

const placeholderOf = (schema) => schema?.properties?._placeholder;

describe("isMinimaxModel", () => {
  it("matches reseller ids that carry the vendor in the namespace", () => {
    expect(isMinimaxModel("minimax/minimax-m3.1-flash:free")).toBe(true);
    expect(isMinimaxModel("MiniMax-M3")).toBe(true);
    expect(isMinimaxModel("minimax-m3.1-flash-free")).toBe(true);
    expect(isMinimaxModel("minimaxai/minimax-m2.7")).toBe(true);
  });

  it("does not match other vendors", () => {
    expect(isMinimaxModel("glm-5.3-flash-free")).toBe(false);
    expect(isMinimaxModel("anthropic/claude-sonnet-4-20250514")).toBe(false);
  });

  it("falls back to body.model when the model arg is absent", () => {
    expect(isMinimaxModel(undefined, { model: "minimax/minimax-m3.1-flash:free" })).toBe(true);
  });
});

describe("sanitizeMinimaxTools — wire shapes", () => {
  it("fills empty properties on an OpenAI chat tool", () => {
    const body = {
      tools: [{ type: "function", function: { name: "advisor", parameters: { type: "object", properties: {} } } }],
    };
    sanitizeMinimaxTools(body);
    expect(placeholderOf(body.tools[0].function.parameters)).toBeDefined();
  });

  it("fills input_schema on a Claude tool WITHOUT inventing a parameters field", () => {
    const body = {
      tools: [{ name: "advisor", description: "x", input_schema: { type: "object", properties: {} } }],
    };
    sanitizeMinimaxTools(body);

    const tool = body.tools[0];
    expect(placeholderOf(tool.input_schema)).toBeDefined();
    expect(tool.parameters).toBeUndefined();
  });

  it("creates input_schema when a Claude tool declares none", () => {
    const body = { tools: [{ name: "cron_list", input_schema: null }] };
    sanitizeMinimaxTools(body);

    expect(placeholderOf(body.tools[0].input_schema)).toBeDefined();
    expect(body.tools[0].parameters).toBeUndefined();
  });

  it("leaves an unrecognised tool shape alone instead of inventing a schema", () => {
    const body = { tools: [{ name: "weird_tool" }] };
    sanitizeMinimaxTools(body);

    expect(body.tools[0].parameters).toBeUndefined();
    expect(body.tools[0].input_schema).toBeUndefined();
  });

  it("keeps non-empty schemas and never forces the placeholder as required", () => {
    const body = {
      tools: [{ type: "function", function: { name: "read", parameters: { type: "object", properties: { path: { type: "string" } } } } }],
    };
    sanitizeMinimaxTools(body);

    const params = body.tools[0].function.parameters;
    expect(params.properties.path).toBeDefined();
    expect(params.properties._placeholder).toBeUndefined();
    expect(params.required).toBeUndefined();
  });

  it("does not append the placeholder to an existing required array", () => {
    const body = {
      tools: [{ type: "function", function: { name: "x", parameters: { type: "object", properties: {}, required: [] } } }],
    };
    sanitizeMinimaxTools(body);

    expect(body.tools[0].function.parameters.required).toEqual([]);
  });

  it("is a no-op for bodies without tools", () => {
    expect(() => sanitizeMinimaxTools({})).not.toThrow();
    expect(() => sanitizeMinimaxTools(null)).not.toThrow();
    expect(() => sanitizeMinimaxTools({ tools: "nope" })).not.toThrow();
  });
});

describe("DefaultExecutor.transformRequest — MiniMax tool shim", () => {
  it("sanitizes a reseller MiniMax model (kc/kilocode lane)", () => {
    const executor = new DefaultExecutor("kilocode");
    const body = {
      model: "minimax/minimax-m3.1-flash:free",
      messages: [{ role: "user", content: "hi" }],
      tools: [{ type: "function", function: { name: "advisor", parameters: { type: "object", properties: {} } } }],
    };

    const out = executor.transformRequest("minimax/minimax-m3.1-flash:free", body, true, {});

    expect(placeholderOf(out.tools[0].function.parameters)).toBeDefined();
  });

  it("does not touch tools for non-MiniMax models", () => {
    const executor = new DefaultExecutor("kilocode");
    const body = {
      model: "anthropic/claude-sonnet-4-20250514",
      messages: [{ role: "user", content: "hi" }],
      tools: [{ type: "function", function: { name: "advisor", parameters: { type: "object", properties: {} } } }],
    };

    const out = executor.transformRequest("anthropic/claude-sonnet-4-20250514", body, true, {});

    expect(out.tools[0].function.parameters.properties).toEqual({});
  });

  it("sanitizes a Claude-format MiniMax body via input_schema", () => {
    const executor = new DefaultExecutor("kilocode");
    const body = {
      model: "minimax/minimax-m3.1-flash:free",
      messages: [{ role: "user", content: "hi" }],
      tools: [{ name: "advisor", input_schema: { type: "object", properties: {} } }],
    };

    const out = executor.transformRequest("minimax/minimax-m3.1-flash:free", body, true, {});

    expect(placeholderOf(out.tools[0].input_schema)).toBeDefined();
    expect(out.tools[0].parameters).toBeUndefined();
  });
});