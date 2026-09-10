import test from "node:test";
import assert from "node:assert/strict";
import { complete, ModelOutputTruncatedError } from "../src/server/model";

test("completion exposes provider length termination as a retryable truncation", async () => {
  const originalFetch = globalThis.fetch;
  let requestBody: Record<string, unknown> | undefined;
  globalThis.fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body));
    return new Response(
      JSON.stringify({
        choices: [{ finish_reason: "length", message: { content: "{\"items\":[" } }],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };
  try {
    await assert.rejects(
      complete(
        "deepseek",
        "deepseek-v4-flash",
        "test-key",
        "system",
        "prompt",
        new AbortController().signal,
        { maxTokens: 1600 },
      ),
      ModelOutputTruncatedError,
    );
    assert.equal(requestBody?.max_tokens, 1600);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
