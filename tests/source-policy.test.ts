import test from "node:test";
import assert from "node:assert/strict";
import { isOfficialSource, isTrustedSource, sourceTier } from "../src/lib/source-policy";
import { balancePublishedIntelligence, filterPublishableIntelligence } from "../src/lib/quality";
import { defaultSettings } from "../src/lib/seed";
import type { Item } from "../src/lib/domain";

test("official source matching rejects spoof domains and generic configured media", () => {
  assert.equal(isOfficialSource("https://press.siemens.com/news"), true);
  assert.equal(isOfficialSource("https://www.miit.gov.cn/policy"), true);
  for (const url of ["https://siemens.com.evil.test/news", "https://fakegov.cn/a",
    "https://reuters-fake.com/a", "https://smallmedia.test/a"])
    assert.equal(isOfficialSource(url), false, url);
  assert.equal(isOfficialSource("https://newcompany.test/news", { 新企业: "https://newcompany.test" }), true);
  assert.equal(sourceTier("https://www.reuters.com/technology/a"), "authoritative");
  assert.equal(sourceTier("https://www.e-works.net.cn/news/a"), "professional");
  assert.equal(isTrustedSource("https://smallmedia.test/a"), false);
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

test("an accountable newsroom can support a high-confidence event while unknown media cannot", () => {
  const quote = "某工业软件企业宣布完成新一轮融资并扩大制造业人工智能产品研发。";
  const item: Item = {
    id: "capital", eventKey: "capital", runId: "run", title: "工业软件企业完成新一轮融资",
    summary: quote, implication: "分析判断", company: "某工业软件企业", category: "资本动态",
    topic: "工业智能", importance: "high", confidence: .84, publishedAt: null,
    observedAt: new Date().toISOString(), evidence: [{ url: "https://www.reuters.com/technology/a", title: "报道", quote }],
  };
  assert.equal(filterPublishableIntelligence([item], defaultSettings).accepted.length, 1);
  item.evidence = [{ ...item.evidence[0], url: "https://smallmedia.test/a" }];
  assert.equal(filterPublishableIntelligence([item], defaultSettings).accepted.length, 0);
});

test("primary-source policy and frontier results survive a conservative normal importance label", () => {
  const quote = "工业和信息化部印发人工智能赋能新型工业化专项行动方案并启动制造业试点。";
  const item: Item = {
    id: "policy", eventKey: "policy", runId: "run", title: "工信部印发工业人工智能专项行动方案",
    summary: quote, implication: "分析判断", company: "行业", category: "产业市场",
    topic: "制造业 + AI", importance: "normal", confidence: .74, publishedAt: null,
    observedAt: new Date().toISOString(), evidence: [{ url: "https://www.miit.gov.cn/policy/a", title: "政策", quote }],
  };
  assert.equal(filterPublishableIntelligence([item], defaultSettings).accepted.length, 1);
});

test("published portfolio caps company concentration and retains available focus companies", () => {
  const make = (company: string, index: number): Item => ({
    id: `${company}-${index}`, eventKey: `${company}-${index}`, runId: "run",
    title: `${company}发布工业智能产品版本${index}`, summary: `${company}发布面向制造现场的工业智能产品与解决方案版本${index}。`,
    implication: "分析判断", company, category: index % 2 ? "产品发布" : "解决方案",
    topic: "工业智能", importance: "high", confidence: .9, publishedAt: null,
    observedAt: new Date(Date.now() - index * 1000).toISOString(), evidence: [{ url: "https://press.siemens.com/a", title: "原文", quote: "发布面向制造现场的工业智能产品与解决方案" }],
  });
  const items = [...Array.from({ length: 9 }, (_, index) => make("浩辰软件", index)), make("雪浪数制", 20), make("蜂巢互联", 21)];
  const result = balancePublishedIntelligence(items, { companies: ["浩辰软件", "雪浪数制", "蜂巢互联"] });
  assert.equal(result.filter((item) => item.company === "浩辰软件").length, 5);
  assert.ok(result.some((item) => item.company === "雪浪数制"));
  assert.ok(result.some((item) => item.company === "蜂巢互联"));
});
