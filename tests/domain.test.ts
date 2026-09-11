import test from "node:test";
import assert from "node:assert/strict";
import { Item, dedupeEvidence, recentIntelligence, mergeItems, mergeProfiles, prioritySignals, settingsSchema, topics } from "../src/lib/domain";
import {
  publicAddress,
  validateUrl,
  parsePage,
  canonicalUrl,
  buildDiscoveryPlan,
  discover,
} from "../src/server/collector";
import { defaultSettings } from "../src/lib/seed";
import { normalizeItemDate, effectiveDate, rebuildItems } from "../src/lib/domain";
import { currentInsights, validateInsights } from "../src/server/synthesis";
import { dashboardProfiles, publishedSnapshot } from "../src/server/store";
import { emptyDatabase } from "../src/lib/seed";
import { assessIntelligence } from "../src/lib/quality";
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
import {
  checkpointConnection,
  checkpointError,
} from "../src/server/checkpoints";

const baseItem = () => ({
  id: "item-1",
  eventKey: "event-1",
  title: "工业智能平台发布",
  summary: "企业披露工业智能平台及面向制造现场的应用能力。",
  implication: "研究判断",
  category: "解决方案" as const,
  topic: "工业智能" as const,
  importance: "high" as const,
  company: "测试公司",
  publishedAt: "2026-09-08T10:00:00Z",
  observedAt: "2026-09-08T10:00:00Z",
  confidence: 0.8,
  evidence: [],
  runId: "run-1",
});
const baseProfile = () => ({
  id: "company-test",
  name: "测试公司",
  narrative: "企业叙事",
  positioning: "市场定位",
  solutions: [],
  capabilities: [],
  funding: "未披露",
  implication: "研究判断",
  evidence: [],
  updatedAt: "2026-09-08T10:00:00Z",
});

test("all intelligence uses a unified rolling 30-day effective window", () => {
  const base = { ...baseItem(), category: "产业市场" as const };
  const now = new Date("2026-09-08T11:00:00Z");
  assert.equal(
    recentIntelligence({ ...base, publishedAt: "2026-08-09T11:00:00Z" }, now),
    true,
  );
  for (const date of ["2026-08-09T10:59:59Z", "2026-09-09T11:00:00Z"])
    assert.equal(recentIntelligence({ ...base, publishedAt: date }, now), false);
  assert.equal(
    recentIntelligence({ ...base, publishedAt: null }, now),
    true,
  );
});

test("dashboard keeps the last published snapshot stable until the next research publication", () => {
  const now = new Date("2026-09-10T12:00:00Z");
  const expiredAfterPublication = normalizeItemDate({
    ...baseItem(),
    publishedAt: "2026-08-11T00:00:00Z",
    observedAt: "2026-09-09T11:00:00Z",
  });
  assert.equal(recentIntelligence(expiredAfterPublication, now), false);
  const stored = [expiredAfterPublication];
  const firstRead = publishedSnapshot({ items: stored, insights: undefined });
  const laterRead = publishedSnapshot({ items: stored, insights: undefined });
  assert.equal(firstRead.items.length, 1);
  assert.equal(laterRead.items.length, 1);
  assert.equal(laterRead.items, stored);
  // The following successful publish evaluates the window and removes it.
  assert.equal(mergeItems(stored, []).filter((item) => recentIntelligence(item, now)).length, 0);
});

test("Sony Aramco bilingual headlines collapse across event keys and categories", () => {
  const titles = [
    "索尼半导体与沙特阿美签署非约束性协议，共推工业AI",
    "索尼与沙特阿美签署谅解备忘录，共推工业AI解决方案",
    "Sony Semiconductor与Aramco签署工业AI合作备忘录，聚焦视觉传感与边缘AI",
  ];
  const summaries = [
    "索尼半导体解决方案公司与沙特阿美签署非约束性谅解备忘录，将结合索尼的图像传感和边缘AI技术。",
    "索尼半导体解决方案公司与沙特阿美签署非约束性谅解备忘录，探索结合索尼传感与AI技术及阿美工业能力。",
    "Sony Semiconductor Solutions与Aramco签署非约束性谅解备忘录，探索工业AI合作，结合Sony图像传感器与边缘AI技术。",
  ];
  const items = titles.map((title, i) => ({ ...baseItem(), id: `sony-${i}`, eventKey: `sony-${i}`, title, summary: summaries[i], evidence: [{ url: `https://example.com/${i}`, title, quote: summaries[i] }] }));
  const merged = mergeItems(items, []);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].evidence.length, 3);
  assert.equal(mergeItems(merged, items).length, 1);
  const unrelated = { ...items[0], id: "different", eventKey: "different", title: "索尼发布新一代图像传感器", summary: "索尼发布新一代图像传感器，提升像素和成像性能。", evidence: [{ ...items[0].evidence[0], quote: "新的独立产品发布事件，与签署协议不同。" }] };
  assert.equal(mergeItems(items, [unrelated]).length, 2);
  assert.equal(mergeItems([items[0]], [{ ...items[0], id: "later", eventKey: "later", publishedAt: "2026-10-09T00:00:00Z" }]).length, 2);
});

test("missing and malformed publication dates expire by first generation, including full rebuilds", () => {
  const now = new Date("2026-09-09T12:00:00Z");
  const old = normalizeItemDate({ ...baseItem(), publishedAt: null, observedAt: "2026-08-01T00:00:00Z" });
  const incoming = normalizeItemDate({ ...old, effectiveAt: undefined, observedAt: now.toISOString() });
  assert.equal(old.dateBasis, "observed");
  assert.equal(recentIntelligence(old, now), false);
  assert.equal(rebuildItems([old], [incoming], now).length, 0);
  assert.equal(Date.parse(effectiveDate(mergeItems([old], [incoming])[0])), Date.parse(old.observedAt));
  const fresh = normalizeItemDate({ ...baseItem(), publishedAt: "invalid" });
  assert.equal(fresh.publishedAt, null);
  assert.equal(Date.parse(effectiveDate(fresh)), Date.parse(fresh.observedAt));
  assert.equal(recentIntelligence(fresh, now), true);
  const noDate = normalizeItemDate({ ...baseItem(), publishedAt: null, observedAt: "" }, "2026-08-01T00:00:00Z");
  assert.equal(recentIntelligence(noDate, now), false);
  const evidence = [{ url: "https://example.com/old", title: "原文", quote: "这是同一个历史工业产品发布事件的完整原文引用证据内容" }];
  assert.equal(rebuildItems([{ ...old, evidence }], [{ ...incoming, evidence, eventKey: "rediscovered-key" }], now).length, 0);
});

test("synthesis validates distinct events, pages and expires with its evidence corpus", () => {
  const events = [0, 1].map((i) => ({ ...baseItem(), id: `event-${i}`, evidence: [{ url: `https://example.com/${i}`, title: "原文", quote: "已核验的企业原始披露内容" }] }));
  const conclusion = {
    concept: "交付能力成为产品竞争的重要组成部分",
    judgment: "两家企业的案例提示，产品竞争需要同时关注软件能力与现场交付能力。",
    reasoning: "两条事件分别反映产品能力和场景落地，说明在当前研究样本中二者呈现互补关系。",
    implication: "炽橙可进一步验证目标客户对现场交付能力的要求。",
    watchpoint: "仍需观察实际客户验收结果，不能据此判断全行业已经完成转向。",
    evidenceIds: events.map((event) => event.id),
  };
  const output = { overview: "当前研究样本提示需要同时评估工业软件能力和客户场景中的实际交付路径。", conclusions: [conclusion] };
  const report = validateInsights(output, events, "run-test");
  assert.equal(currentInsights(report, [...events].reverse()), report);
  assert.equal(currentInsights(report, events.slice(0, 1)), undefined);
  assert.equal(currentInsights(report, [{ ...events[0], summary: "修正后的事实" }, events[1]]), undefined);
  assert.throws(() => validateInsights({ ...output, conclusions: [{ ...conclusion, evidenceIds: ["event-0", "not-real"] }] }, events, "run-test"));
  assert.throws(() => validateInsights({ ...output, conclusions: [{ ...conclusion, evidenceIds: ["event-0", "event-0"] }] }, events, "run-test"));
  assert.throws(() => validateInsights(output, events.map((e) => ({ ...e, evidence: events[0].evidence })), "run-test"));
});

test("company archives outlive news window and failed refresh cannot erase them", () => {
  const db = emptyDatabase();
  db.settings.companies = ["能科科技"];
  const profile = { ...baseProfile(), name: "能科科技", basis: "official" as const, updatedAt: "2024-01-01T00:00:00Z", solutions: ["工业软件"], capabilities: ["数字孪生"], evidence: [{ url: "https://www.nancal.com/", title: "官网", quote: "企业官网原文证据" }] };
  db.profiles = mergeProfiles([profile], [{ ...profile, basis: undefined, evidence: [], solutions: [], capabilities: [], narrative: "占位" }]);
  assert.equal(dashboardProfiles(db)[0].narrative, profile.narrative);
  assert.equal(dashboardProfiles(db)[0].updatedAt, profile.updatedAt);
});

test("official profile documents produce complete grounded profiles, never fresh news", () => {
  const quote = "能科科技提供工业软件及数字孪生产品技术服务";
  const document = { url: "https://www.nancal.com/", title: "官网", text: quote, publishedAt: null, source: "官网", profileCompany: "能科科技" };
  const profile = { ...baseProfile(), name: "能科科技", solutions: ["工业软件"], capabilities: ["数字孪生"], evidence: [{ document: 0, quote }] };
  const output = extractionSchema.parse({ items: [{ ...baseItem(), evidence: [{ document: 0, quote }] }], profiles: [profile, { ...profile, name: "其他公司" }, { ...profile, solutions: [] }] });
  const grounded = groundExtraction(output, [document], "official-test");
  assert.equal(grounded.items.length, 0);
  assert.equal(grounded.profiles.length, 1);
  assert.equal(grounded.profiles[0].basis, "official");
});
test("fusion is idempotent, unions sources and never re-dates rediscovered events", () => {
  const item = {
    ...baseItem(),
    evidence: [
      { url: "https://example.com/first", title: "first", quote: "original" },
    ],
  };
  const update = {
    ...item,
    title: "updated",
    runId: "daily-2026-09-11",
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
  assert.equal(merged[0].runId, "daily-2026-09-11");
  assert.equal(merged[0].firstSeenRunId, "run-1");
  assert.equal(mergeItems([], [update])[0].firstSeenRunId, "daily-2026-09-11");
});
test("profile update preserves known funding and historical capabilities", () => {
  const profile = {
    ...baseProfile(),
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
test("major signals require confidence and evidence, then rank by quality", () => {
  const evidence = [{ url: "https://example.com", title: "source", quote: "verified quote" }];
  const critical = { ...baseItem(), importance: "critical" as const, confidence: 0.9, evidence };
  const weak = { ...baseItem(), id: "weak", eventKey: "weak", confidence: 0.7, evidence };
  assert.deepEqual(prioritySignals([weak, critical]).map((item) => item.id), [critical.id]);
  assert.equal(prioritySignals([{ ...baseItem(), confidence: .95, evidence: [...evidence, { ...evidence[0], url: "https://example.com/?utm_source=copy", quote: "another quote" }] }]).length, 0);
});
test("evidence keeps independent corroboration but removes repeated excerpts", () => {
  const quote = "蜂巢互联宣布完成十二亿元融资并将资金投入物理AI仿真引擎研发";
  const evidence = dedupeEvidence([
    { url: "https://www.honeycombtech.com/news/a?utm_source=x", title: "官网", quote },
    { url: "https://www.honeycombtech.com/news/a", title: "官网副本", quote: `${quote}与产业化` },
    { url: "https://copy.example.com/a", title: "转载", quote: `${quote}与产业化` },
    { url: "https://second.example.com/a", title: "独立报道", quote: "该轮融资由产业资本参与，企业同时披露了新的研发与交付规划" },
  ]);
  assert.equal(evidence.length, 2);
  assert.ok(evidence.some((entry) => entry.url.includes("honeycombtech.com")));
});
test("publication quality gate rejects off-scope, vague and overstated claims", () => {
  const assess = (overrides: Partial<Item>) => assessIntelligence({
    ...baseItem(),
    evidence: [{ url: "https://unknown.example.com/news", title: "原文", quote: "企业披露相关信息，但没有更多独立核验材料" }],
    ...overrides,
  }, defaultSettings);
  assert.equal(assess({
    title: "华大基因发布生命数字孪生体系与i99智健平台",
    summary: "面向基因与生命健康管理发布数字孪生平台。",
    company: "华大基因",
  }).publishable, false);
  assert.equal(assess({
    title: "中工互联发布智工6.0，推动工业AI从AI顾问到AI工人",
    summary: "企业自述发布工业AI产品，但暂无官网或独立权威来源完成核验。",
    company: "中工互联",
  }).publishable, false);
  assert.equal(assess({
    title: "传统工厂加速AI落地，工业垂类模型向生产决策纵深拓展",
    summary: "行业正在加速制造业AI转型升级。",
    company: "行业",
  }).publishable, false);
  assert.equal(assess({
    title: "Aramco Digital与Avathon达成战略合作，加速工业AI落地",
    summary: "双方宣布建立合作伙伴关系并推动行业发展。",
    company: "沙特阿美",
  }).publishable, false);
  assert.equal(assess({
    title: "Anthropic推出可自主操作制造设备的MHS工具",
    summary: "Anthropic正式发布工具并已具备自主控制制造设备能力。",
    company: "Anthropic",
    evidence: [{
      url: "https://www.anthropic.com/news/model-hardware-standard-research-preview",
      title: "Model Hardware Standard research preview",
      quote: "We are sharing the Model Hardware Standard as a research preview and proposed specification for programmable devices.",
    }],
  }).publishable, false);
});
test("publication quality gate accepts concrete official focus-company events", () => {
  const snow = assessIntelligence({
    ...baseItem(),
    title: "雪浪数制发布工业数据平台新版本",
    summary: "雪浪数制发布面向制造现场的工业数据平台新版本。",
    company: "雪浪数制",
    evidence: [{
      url: "https://www.xuelangyun.com/news/product",
      title: "产品新闻",
      quote: "雪浪数制发布面向制造现场的工业数据平台新版本",
    }],
  }, defaultSettings);
  const honeycomb = assessIntelligence({
    ...baseItem(),
    title: "蜂巢互联完成12亿元融资并发布物理AI仿真引擎",
    summary: "蜂巢互联完成12亿元融资，资金用于物理AI仿真引擎研发。",
    company: "蜂巢互联",
    category: "资本动态",
    evidence: [{
      url: "https://www.honeycombtech.com/news/company",
      title: "公司新闻",
      quote: "蜂巢互联完成12亿元融资，资金将用于物理AI仿真引擎研发",
    }],
  }, defaultSettings);
  assert.equal(snow.publishable, true, snow.reasons.join("、"));
  assert.equal(honeycomb.publishable, true, honeycomb.reasons.join("、"));
});
test("settings reject unlisted model identifiers", () => {
  assert.equal(settingsSchema.safeParse(defaultSettings).success, true);
  assert.equal(settingsSchema.safeParse({ ...defaultSettings, models: { ...defaultSettings.models, deepseek: "deepseek-chat" } }).success, false);
});
test("discovery plan covers every configured target and site", () => {
  const plan = buildDiscoveryPlan(defaultSettings, "full");
  const lanes = new Set(plan.map((entry) => entry.lane));
  assert.deepEqual(
    lanes,
    new Set([
      "常规行业扫描",
      "配置关键词扩展",
      "重点企业追踪",
      "指定网站发现",
    ]),
  );
  assert.ok(plan.some((entry) => entry.query.includes("industrial AI")));
  assert.ok(plan.some((entry) => entry.query.includes("site:press.siemens.com")));
  for (const direction of topics)
    assert.ok(plan.some((entry) => entry.coverageKey === `方向:${direction}`));
  for (const keyword of defaultSettings.keywords)
    assert.ok(plan.some((entry) => entry.query.includes(`"${keyword}"`)));
  for (const company of defaultSettings.companies)
    assert.ok(plan.some((entry) => entry.query.includes(`"${company}"`)));
  for (const company of ["雪浪数制", "蜂巢互联"])
    assert.ok(plan.some((entry) => entry.focusCompany === company &&
      entry.coverageKey === `企业官网动态:${company}` && entry.priority === 4));
  const incremental = buildDiscoveryPlan(defaultSettings, "incremental");
  for (const company of ["雪浪数制", "蜂巢互联"])
    assert.ok(incremental.some((entry) => entry.focusCompany === company &&
      /融资|投资|并购/.test(entry.query)));
});
test("Tavily discovery uses Advanced search, date scope and URL deduplication", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.TAVILY_API_KEY;
  const requests: Record<string, unknown>[] = [];
  process.env.TAVILY_API_KEY = "test-tavily-key";
  globalThis.fetch = async (_input, init) => {
    requests.push(JSON.parse(String(init?.body)));
    return new Response(
      JSON.stringify({
        results: [
          { url: "https://example.com/report?utm_source=search" },
          { url: "https://example.com/report" },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  try {
    const result = await discover(
      { ...defaultSettings, keywords: [], companies: [], sources: [], companyWebsites: { fixture: "https://example.com" } },
      "full",
      [],
      "2025-09-09",
      AbortSignal.timeout(5000),
    );
    assert.equal(result.queryCount, 12);
    assert.equal(result.resultCount, 24);
    assert.equal(result.deduplicatedCount, 1);
    assert.ok(
      requests.every(
        (request) =>
          request.search_depth === "advanced" &&
          request.chunks_per_source === 3 &&
          request.max_results === 10 &&
          Array.isArray(request.include_domains) && request.include_domains.includes("example.com") &&
          request.start_date === "2025-09-09",
      ),
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.TAVILY_API_KEY;
    else process.env.TAVILY_API_KEY = originalKey;
  }
});
test("grounding discards fabricated quotes and binds dates to verified documents", () => {
  const item = {
    title: "工业智能体发布新产品",
    summary: "发布可核验的工业智能体平台产品。",
    implication: "研究判断",
    category: "解决方案",
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
  assert.equal(output.extraction!.items[0].category, "产品发布");
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
test("checkpoint errors identify connection, credential and permission failures", () => {
  assert.match(
    checkpointError(Object.assign(new Error("auth"), { code: "28P01" })),
    /认证失败/,
  );
  assert.match(
    checkpointError(Object.assign(new Error("denied"), { code: "42501" })),
    /无权访问/,
  );
  assert.match(
    checkpointError(Object.assign(new Error("network"), { code: "ENOTFOUND" })),
    /Shared Pooler/,
  );
  assert.match(
    checkpointError(
      Object.assign(new Error("network"), { code: "ECONNRESET" }),
    ),
    /Shared Pooler/,
  );
  assert.match(
    checkpointError(Object.assign(new Error("other"), { code: "XX000" })),
    /XX000/,
  );
});
test(
  "checkpoint connection makes strict TLS explicit without exposing it in diagnostics",
  () => {
    const connection = checkpointConnection(
      "postgresql://user:secret@aws-0-us-west-2.pooler.supabase.com:5432/postgres?sslmode=require",
    );
    assert.equal(connection.target.host, "aws-0-us-west-2.pooler.supabase.com");
    assert.equal(connection.target.port, "5432");
    assert.equal(connection.target.database, "postgres");
    assert.equal(connection.target.sslmode, "verify-full");
    assert.match(connection.connectionString, /sslmode=verify-full/);
    assert.equal(JSON.stringify(connection.target).includes("secret"), false);
  },
);
test("checkpoint connection respects an explicit libpq TLS compatibility choice", () => {
  const connection = checkpointConnection(
    "postgresql://user:secret@aws-0-us-west-2.pooler.supabase.com:5432/postgres?uselibpqcompat=true&sslmode=require",
  );
  assert.equal(connection.target.sslmode, "require");
  assert.equal(connection.target.certificateVerification, "libpq-require");
  assert.match(connection.connectionString, /uselibpqcompat=true/);
  assert.match(connection.connectionString, /sslmode=require/);
});

