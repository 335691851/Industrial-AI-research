import test from "node:test";
import assert from "node:assert/strict";
import { recentNews, mergeItems, mergeProfiles } from "../src/lib/domain";
import { demoDatabase } from "../src/lib/seed";
import {
  publicAddress,
  validateUrl,
  parsePage,
  canonicalUrl,
} from "../src/server/collector";
import {
  extractionSchema,
  groundExtraction,
  normalizeExtraction,
} from "../src/server/research";
import {
  canEdit,
  equalSecret,
  publicError,
  requireWrite,
} from "../src/server/security";

test("news uses publication time, excludes unknown/future/older than 5 days", () => {
  const base = { ...demoDatabase().items[0], category: "行业新闻" as const };
  const now = new Date("2026-09-08T11:00:00Z");
  assert.equal(
    recentNews({ ...base, publishedAt: "2026-09-03T11:00:00Z" }, now),
    true,
  );
  for (const date of [
    null,
    "invalid",
    "2026-09-03T10:59:59Z",
    "2026-09-09T11:00:00Z",
  ])
    assert.equal(recentNews({ ...base, publishedAt: date }, now), false);
  assert.equal(
    recentNews(
      { ...base, category: "前沿研究", publishedAt: "2020-01-01" },
      now,
    ),
    true,
  );
});
test("fusion is idempotent, unions sources and never re-dates rediscovered events", () => {
  const item = {
    ...demoDatabase().items[0],
    evidence: [
      { url: "https://example.com/first", title: "first", quote: "original" },
    ],
  };
  const update = {
    ...item,
    title: "updated",
    publishedAt: new Date(Date.now() + 86400000).toISOString(),
    evidence: [
      {
        url: "https://example.com/second",
        title: "second",
        quote: "corroboration",
      },
    ],
  };
  const merged = mergeItems([item], [update, update]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].evidence.length, 2);
  assert.equal(merged[0].publishedAt, item.publishedAt);
});
test("profile update preserves known funding and historical capabilities", () => {
  const profile = {
    ...demoDatabase().profiles[0],
    funding: "已披露融资",
    capabilities: ["能力A"],
  };
  const merged = mergeProfiles(
    [profile],
    [{ ...profile, funding: "未披露", capabilities: ["能力B"] }],
  );
  assert.equal(merged[0].funding, "已披露融资");
  assert.deepEqual(merged[0].capabilities, ["能力A", "能力B"]);
});
test("collector rejects private, loopback, mapped, non-HTTP and credential URLs", () => {
  for (const address of [
    "127.0.0.1",
    "10.1.0.2",
    "169.254.169.254",
    "::1",
    "::ffff:127.0.0.1",
    "192.168.1.1",
    "100.64.0.1",
    "fc00::1",
  ])
    assert.equal(publicAddress(address), false, address);
  assert.equal(publicAddress("8.8.8.8"), true);
  for (const url of [
    "file:///etc/passwd",
    "https://localhost",
    "http://127.1",
    "http://2130706433",
    "http://user:pass@example.com",
    "http://example.com:8080",
  ])
    assert.throws(() => validateUrl(url), url);
  assert.equal(
    canonicalUrl("https://example.com/a?utm_source=x&b=1#foo"),
    "https://example.com/a?b=1",
  );
});
test("parser takes explicit publication metadata, not current time", () => {
  const body = "工业技术研究正文。".repeat(30);
  const p = parsePage(
    `<html><head><title>研究</title><meta property="article:published_time" content="2026-09-07T11:00:00Z"/></head><body><article>${body}</article></body></html>`,
    "https://example.com/",
    "test",
  );
  assert.equal(p.document.publishedAt, "2026-09-07T11:00:00.000Z");
  assert.equal(
    parsePage(`<body>${body}</body>`, "https://example.com", "test").document
      .publishedAt,
    null,
  );
});
test("grounding discards fabricated quotes and binds dates to verified documents", () => {
  const item = {
    title: "工业智能体发布新产品",
    summary: "发布可核验的工业智能体平台产品。",
    implication: "研究判断",
    category: "产品方案",
    topic: "工业智能",
    importance: "high",
    company: "测试公司",
    eventKey: "agent-launch",
    confidence: 0.8,
    evidence: [{ document: 0, quote: "正式发布工业智能体平台产品与技术能力" }],
  };
  const output = extractionSchema.parse({
    items: [
      item,
      {
        ...item,
        title: "伪造证据不得发布",
        evidence: [{ document: 0, quote: "模型自己编造的不存在于原文的句子" }],
      },
    ],
    profiles: [],
  });
  const result = groundExtraction(
    output,
    [
      {
        url: "https://example.com/real",
        title: "发布",
        text: "公司正式发布工业智能体平台产品与技术能力。",
        publishedAt: "2026-09-01T00:00:00Z",
        source: "official",
      },
    ],
    "test",
  );
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].evidence[0].url, "https://example.com/real");
  assert.equal(result.items[0].publishedAt, "2026-09-01T00:00:00Z");
});
test("normalizes DeepSeek-style aliases without weakening evidence requirements", () => {
  const output = normalizeExtraction({
    intelligence: [
      {
        headline: "测试公司推出工业智能平台",
        core_fact: "测试公司正式发布工业智能平台，并披露面向制造现场的应用能力。",
        insight: "可作为炽橙关注的工业智能能力布局。",
        type: "产品",
        direction: "工业AI",
        priority: "重大",
        enterprise: "测试公司",
        event_key: "test-company-agent-launch",
        certainty: "90%",
        citations: [
          {
            document_index: 0,
            excerpt: "正式发布工业智能平台，并披露面向制造现场的应用能力",
          },
        ],
      },
      { headline: "没有引用的条目", core_fact: "这条内容不会被发布，因为没有可核验证据。" },
    ],
    company_profiles: [
      {
        company: "测试公司",
        story: "以工业智能平台连接制造现场数据和应用。",
        position: "制造业工业智能软件提供商。",
        product_solutions: "工业智能平台、现场应用",
        abilities: "制造数据分析、智能体编排",
        investment: "未披露",
        takeaway: "建议持续跟踪其产品落地。",
        citations: [
          {
            document_index: 0,
            excerpt: "正式发布工业智能平台，并披露面向制造现场的应用能力",
          },
        ],
      },
    ],
  });
  assert.ok(output.extraction);
  assert.equal(output.extraction!.items.length, 1);
  assert.equal(output.extraction!.items[0].category, "产品方案");
  assert.equal(output.extraction!.items[0].topic, "工业智能");
  assert.equal(output.extraction!.items[0].importance, "critical");
  assert.equal(output.extraction!.items[0].confidence, 0.9);
  assert.equal(output.extraction!.profiles.length, 1);
});
test("writes reject cross-site requests and production defaults to read-only", () => {
  assert.throws(() =>
    requireWrite(
      new Request("http://localhost:3000/api", {
        headers: { origin: "https://evil.example" },
      }),
    ),
  );
  const old = process.env.VERCEL;
  process.env.VERCEL = "1";
  assert.equal(canEdit(new Request("https://workspace.vercel.app/api")), false);
  if (old === undefined) delete process.env.VERCEL;
  else process.env.VERCEL = old;
  assert.equal(equalSecret("secret", "secrets"), false);
  assert.equal(
    publicError(new Error("sk-do-not-expose")),
    "操作未完成，请检查服务配置或稍后重试。敏感错误内容已隐藏。",
  );
});
