import { describe, it, expect } from "vitest";
import { OpenCodeExecutor, sanitizeMinimaxTools } from "../../open-sse/executors/opencode.js";

describe("sanitizeMinimaxTools", () => {
  it("injects placeholder for function with empty properties", () => {
    const body = {
      tools: [
        {
          type: "function",
          function: {
            name: "advisor",
            description: "Get advice",
            parameters: { type: "object", properties: {} },
          },
        },
      ],
    };

    sanitizeMinimaxTools(body);

    const fn = body.tools[0].function;
    expect(fn.parameters.properties._placeholder).toBeDefined();
    expect(fn.parameters.properties._placeholder.type).toBe("string");
    expect(fn.parameters.required).toBeUndefined();
  });

  it("injects placeholder for empty parameters object {}", () => {
    const body = {
      tools: [
        {
          type: "function",
          function: {
            name: "get_goal",
            parameters: {},
          },
        },
      ],
    };

    sanitizeMinimaxTools(body);

    const fn = body.tools[0].function;
    expect(fn.parameters.type).toBe("object");
    expect(fn.parameters.properties._placeholder).toBeDefined();
  });

  it("injects placeholder for missing or null parameters", () => {
    const body = {
      tools: [
        {
          type: "function",
          function: {
            name: "null_param_tool",
            parameters: null,
          },
        },
      ],
    };

    sanitizeMinimaxTools(body);

    const fn = body.tools[0].function;
    expect(fn.parameters.properties._placeholder).toBeDefined();
  });

  it("handles flat tool shape (Responses/Code format)", () => {
    const body = {
      tools: [
        {
          type: "function",
          name: "flat_tool",
          parameters: { type: "object", properties: {} },
        },
      ],
    };

    sanitizeMinimaxTools(body);

    expect(body.tools[0].parameters.properties._placeholder).toBeDefined();
  });

  it("does not modify tools that already have properties", () => {
    const body = {
      tools: [
        {
          type: "function",
          function: {
            name: "read_file",
            parameters: {
              type: "object",
              properties: {
                file_path: { type: "string" },
              },
              required: ["file_path"],
            },
          },
        },
      ],
    };

    sanitizeMinimaxTools(body);

    const fn = body.tools[0].function;
    expect(fn.parameters.properties._placeholder).toBeUndefined();
    expect(fn.parameters.properties.file_path).toEqual({ type: "string" });
    expect(fn.parameters.required).toEqual(["file_path"]);
  });

  it("never injects _placeholder into required array even if required exists", () => {
    const body = {
      tools: [
        {
          type: "function",
          function: {
            name: "empty_with_req",
            parameters: { type: "object", properties: {}, required: [] },
          },
        },
      ],
    };

    sanitizeMinimaxTools(body);

    const fn = body.tools[0].function;
    expect(fn.parameters.properties._placeholder).toBeDefined();
    expect(fn.parameters.required).toEqual([]);
  });
});

describe("OpenCodeExecutor.transformRequest minimax tool compatibility", () => {
  const executor = new OpenCodeExecutor();

  it("sanitizes empty tool parameters when model is minimax-m3.1-flash-free", () => {
    const body = {
      model: "minimax-m3.1-flash-free",
      messages: [{ role: "user", content: "hello" }],
      tools: [
        {
          type: "function",
          function: {
            name: "advisor",
            description: "Get advice",
            parameters: { type: "object", properties: {} },
          },
        },
        {
          type: "function",
          function: {
            name: "read_file",
            parameters: {
              type: "object",
              properties: { path: { type: "string" } },
              required: ["path"],
            },
          },
        },
      ],
    };

    executor.transformRequest("minimax-m3.1-flash-free", body, true, {});

    const advisor = body.tools.find((t) => t.function?.name === "advisor");
    expect(advisor.function.parameters.properties._placeholder).toBeDefined();
    expect(advisor.function.parameters.required).toBeUndefined();

    const readFile = body.tools.find((t) => t.function?.name === "read_file");
    expect(readFile.function.parameters.properties._placeholder).toBeUndefined();
    expect(readFile.function.parameters.properties.path).toBeDefined();

    // Fingerprint tools (read, shell) must not be polluted with placeholder
    const read = body.tools.find((t) => t.function?.name === "read");
    if (read) {
      expect(read.function.parameters.properties._placeholder).toBeUndefined();
    }
  });

  it("does not sanitize empty tool parameters for non-minimax models (e.g. glm-5.3-flash-free)", () => {
    const body = {
      model: "glm-5.3-flash-free",
      messages: [{ role: "user", content: "hello" }],
      tools: [
        {
          type: "function",
          function: {
            name: "advisor",
            description: "Get advice",
            parameters: { type: "object", properties: {} },
          },
        },
      ],
    };

    executor.transformRequest("glm-5.3-flash-free", body, true, {});

    const advisor = body.tools.find((t) => t.function?.name === "advisor");
    expect(advisor.function.parameters.properties._placeholder).toBeUndefined();
    expect(advisor.function.parameters.properties).toEqual({});
  });
});
