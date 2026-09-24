import test from "node:test";
import assert from "node:assert/strict";
import { Annotation, END, START, MemorySaver, StateGraph } from "@langchain/langgraph";
import { checkpointOperation, safeErrorDetails } from "../src/server/checkpoints";
import { discover } from "../src/server/collector";
import { defaultSettings } from "../src/lib/seed";

test("checkpoint retries transient errors but never credentials or permission failures", async () => {
  let calls = 0;
  assert.equal(await checkpointOperation("保存", async () => {
    if (++calls < 3) throw Object.assign(new Error("private connection string"), { code: "ECONNRESET" });
    return "saved";
  }), "saved");
  assert.equal(calls, 3);
  calls = 0;
  await assert.rejects(checkpointOperation("保存", async () => {
    calls++;
    throw Object.assign(new Error("secret password"), { code: "42501" });
  }), /检查点保存失败（42501）/);
  assert.equal(calls, 1);
  assert.equal(JSON.stringify(safeErrorDetails(new Error("secret password"))).includes("secret"), false);
});

test("sync durability stops before publication if preceding checkpoint cannot be saved", async () => {
  class FailingSaver extends MemorySaver {
    override async put(...args: Parameters<MemorySaver["put"]>) {
      if (args[2].step === 1) throw new Error("simulated checkpoint failure");
      return super.put(...args);
    }
  }
  let published = false;
  const state = Annotation.Root({ value: Annotation<number> });
  const graph = new StateGraph(state)
    .addNode("research", async () => ({ value: 1 }))
    .addNode("publish", async () => { published = true; return {}; })
    .addEdge(START, "research").addEdge("research", "publish").addEdge("publish", END)
    .compile({ checkpointer: new FailingSaver() });
  await assert.rejects(graph.invoke({ value: 0 }, { configurable: { thread_id: "test" }, durability: "sync" }), /simulated checkpoint failure/);
  assert.equal(published, false);
});

test("search filtering reconciles every rejection and uses body for company identity", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.TAVILY_API_KEY;
  process.env.TAVILY_API_KEY = "test-only";
  const valid = { url: "https://www.reuters.com/technology/test", title: "工业产品发布", content: "新产品", raw_content: "西门子正式发布工业平台。".repeat(30), score: .8 };
  globalThis.fetch = async () => new Response(JSON.stringify({ results: [
    valid, valid, { title: "missing URL" },
    { ...valid, url: "https://untrusted.test/a" },
    { ...valid, url: "https://www.reuters.com/low", score: .1 },
    { ...valid, url: "https://www.reuters.com/unrelated", raw_content: "无关企业新闻" },
  ] }), { status: 200 });
  try {
    const result = await discover(defaultSettings, "incremental", [{
      lane: "重点企业追踪", coverageKey: "西门子", query: "西门子产品", topic: "general", focusCompany: "西门子",
    }], "2026-09-21", new AbortController().signal, true);
    assert.equal(result.resultCount, 6);
    assert.equal(result.deduplicatedCount, 1);
    assert.deepEqual(result.filtering, { invalid: 1, untrusted: 1, domainMismatch: 0, lowScore: 1, companyMismatch: 1, duplicates: 1 });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.TAVILY_API_KEY;
    else process.env.TAVILY_API_KEY = originalKey;
  }
});
