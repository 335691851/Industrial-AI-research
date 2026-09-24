import test from "node:test";
import assert from "node:assert/strict";
import { phaseBudget, phaseSignal } from "../src/server/run-budget";
import { discover } from "../src/server/collector";
import { defaultSettings } from "../src/lib/seed";

test("stage budgets reserve publication time and do not abort the parent run", async () => {
  assert.equal(phaseBudget(1000, 110000, 61000), 50000);
  assert.equal(phaseBudget(1000, 110000, 120000), 0);
  const parent = new AbortController();
  const child = phaseSignal(parent.signal, Date.now() - 1000, 1);
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(child.aborted, true);
  assert.equal(parent.signal.aborted, false);
});

test("discovery returns accumulated candidates and actual request count at deadline", async () => {
  const fetchBefore = globalThis.fetch;
  const keyBefore = process.env.TAVILY_API_KEY;
  process.env.TAVILY_API_KEY = "test-only";
  const controller = new AbortController();
  let requests = 0;
  globalThis.fetch = async () => {
    requests++;
    if (requests === 6) controller.abort();
    return new Response(JSON.stringify({ results: [{ url: `https://www.siemens.com/news/${requests}`, title: "工业技术", score: .01 }] }));
  };
  try {
    const result = await discover(defaultSettings, "full", [], "2026-09-01", controller.signal);
    assert.equal(requests, 6);
    assert.equal(result.queryCount, 6);
    assert.equal(result.candidates.length, 6);
    assert.equal(result.estimatedCredits, result.basicQueryCount + result.advancedQueryCount * 2);
  } finally {
    globalThis.fetch = fetchBefore;
    if (keyBefore === undefined) delete process.env.TAVILY_API_KEY;
    else process.env.TAVILY_API_KEY = keyBefore;
  }
});
