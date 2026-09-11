import test from "node:test";
import assert from "node:assert/strict";
import { isOfficialSource } from "../src/lib/source-policy";
import { filterPublishableIntelligence } from "../src/lib/quality";
import { defaultSettings } from "../src/lib/seed";
import type { Item } from "../src/lib/domain";

test("official source matching rejects spoof domains and generic configured media", () => {
  assert.equal(isOfficialSource("https://press.siemens.com/news"), true);
  assert.equal(isOfficialSource("https://www.miit.gov.cn/policy"), true);
  for (const url of ["https://siemens.com.evil.test/news", "https://fakegov.cn/a",
    "https://reuters-fake.com/a", "https://smallmedia.test/a"])
    assert.equal(isOfficialSource(url), false, url);
  assert.equal(isOfficialSource("https://newcompany.test/news", { 新企业: "https://newcompany.test" }), true);
});

test("multiple unofficial reports cannot pass; mixed evidence keeps official citations only", () => {
  const quote = "西门子发布工业智能平台及面向制造现场的应用能力。";
  const item: Item = {
    id: "event", eventKey: "event", runId: "run", title: quote, summary: quote,
    implication: "分析判断", company: "西门子", category: "产品发布", topic: "工业智能",
    importance: "high", confidence: .9, publishedAt: null, observedAt: new Date().toISOString(),
    evidence: ["https://smallmedia.test/a", "https://anothermedia.test/b"].map((url) => ({ url, title: quote, quote })),
  };
  const settings = { ...defaultSettings, sources: [{ id: "media", name: "媒体", url: "https://smallmedia.test", kind: "website" as const, enabled: true }] };
  assert.equal(filterPublishableIntelligence([item], settings).accepted.length, 0);
  item.evidence.push({ url: "https://press.siemens.com/a", title: quote, quote });
  const published = filterPublishableIntelligence([item], settings).accepted;
  assert.equal(published.length, 1);
  assert.deepEqual(published[0].evidence.map((e) => e.url), ["https://press.siemens.com/a"]);
});
