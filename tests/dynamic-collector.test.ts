import test from "node:test";
import assert from "node:assert/strict";
import { canonicalUrl, parsePage, parseSourcePage, SourceContentError } from "../src/server/collector";
import { evidenceUrl } from "../src/lib/identity";

const url = "https://www.xuelangyun.com/#/about/xly";
const shell = '<html><head><title>关于雪浪云</title></head><body><noscript>Enable JavaScript to continue.</noscript><div id="app"></div><script src="/app.js"></script></body></html>';
const text = "雪浪数制是一家用于验证动态正文提取的企业，本段公开资料不会写入真实数据库。".repeat(10);

test("hash routes retain page and evidence identity while ordinary anchors are removed", () => {
  for (const normalize of [canonicalUrl, evidenceUrl]) {
    assert.equal(normalize(url), url);
    assert.notEqual(normalize(url), normalize("https://www.xuelangyun.com/#/products"));
    assert.equal(normalize("https://example.com/about?utm_source=x#section"), "https://example.com/about");
    assert.equal(normalize("https://example.com/#!/about"), "https://example.com/#!/about");
    assert.equal(normalize("https://example.com/#/"), "https://example.com/#/");
  }
  const parsed = parsePage(`<body>${text}<a href="#/about/xly">关于</a><a href="#/products">产品</a></body>`, "https://example.com/", "官网");
  assert.deepEqual(parsed.links, ["https://example.com/#/about/xly", "https://example.com/#/products"]);
});

test("dynamic shells, empty pages and access restrictions have distinct diagnostics", () => {
  for (const [html, reason] of [[shell, "dynamic"], ["<body>暂无内容</body>", "empty"], ["<body>请完成验证</body>", "restricted"], ["<title>Just a moment</title><div id='app'></div><script src='/app.js'></script>", "restricted"]]) {
    assert.throws(() => parsePage(html, url, "官网"), (error) => error instanceof SourceContentError && error.reason === reason);
  }
});

test("dynamic fallback is bounded, route-specific, and never used to bypass restrictions", async (t) => {
  const savedKey = process.env.TAVILY_API_KEY;
  const savedFetch = globalThis.fetch;
  let calls = 0;
  let status = 200;
  let resultUrl = url;
  let content: unknown = text;
  globalThis.fetch = async (input, init) => {
    calls++;
    assert.equal(input, "https://api.tavily.com/extract");
    const body = JSON.parse(String(init?.body));
    assert.deepEqual(body.urls, [url]);
    assert.equal(body.extract_depth, "advanced");
    assert.equal(body.format, "text");
    assert.equal(body.timeout, 20);
    assert.ok(init?.signal);
    assert.equal(body.query, undefined); // Full body, not search chunks or generated answers.
    return Response.json({ results: [{ url: resultUrl, raw_content: content }] }, { status });
  };
  t.after(() => {
    globalThis.fetch = savedFetch;
    if (savedKey === undefined) delete process.env.TAVILY_API_KEY;
    else process.env.TAVILY_API_KEY = savedKey;
  });
  const signal = new AbortController().signal;
  delete process.env.TAVILY_API_KEY;
  await assert.rejects(parseSourcePage({ url, html: shell }, "官网", signal), /TAVILY_API_KEY/);
  assert.equal(calls, 0);
  process.env.TAVILY_API_KEY = "fixture-key";
  const staticPage = await parseSourcePage({ url: "https://example.com/about", html: `<body>${text}</body>` }, "官网", signal);
  assert.equal(staticPage.document.retrievalMethod, "html");
  assert.equal(calls, 0);
  for (const html of ["<body>请完成验证</body>", "<body>暂无正文</body>"]) {
    await assert.rejects(parseSourcePage({ url, html }, "官网", signal), SourceContentError);
  }
  assert.equal(calls, 0);
  const parsed = await parseSourcePage({ url, html: shell }, "官网", signal);
  assert.equal(parsed.document.text, text);
  assert.equal(parsed.document.url, url);
  assert.equal(parsed.document.retrievalMethod, "advanced-extract");
  assert.equal(parsed.document.publishedAt, null);
  assert.equal(calls, 1);
  // A hash route must be extracted even when server HTML contains a populated homepage.
  await parseSourcePage({ url, html: `<body>${text}</body>` }, "官网", signal);
  assert.equal(calls, 2);
  for (const wrongUrl of ["https://evil.example/#/about/xly", "http://127.0.0.1/"]) {
    resultUrl = wrongUrl;
    await assert.rejects(parseSourcePage({ url, html: shell }, "官网", signal), /未返回对应页面/);
  }
  resultUrl = "https://www.xuelangyun.com/";
  const homepage = await parseSourcePage({ url, html: shell }, "雪浪数制", signal, "雪浪数制");
  assert.equal(homepage.document.url, "https://www.xuelangyun.com/");
  assert.equal(homepage.document.retrievalMethod, "official-homepage-fallback");
  content = "另一家企业的官网首页内容。".repeat(20);
  await assert.rejects(parseSourcePage({ url, html: shell }, "雪浪数制", signal, "雪浪数制"), /未明确包含目标企业身份/);
  resultUrl = url;
  content = "请完成验证";
  await assert.rejects(parseSourcePage({ url, html: shell }, "官网", signal), /访问验证/);
  content = "Enable JavaScript";
  await assert.rejects(parseSourcePage({ url, html: shell }, "官网", signal), /仍未取得有效正文/);
  content = text;
  status = 429;
  await assert.rejects(parseSourcePage({ url, html: shell }, "官网", signal), /HTTP 429/);
  const beforeAbort = calls;
  await assert.rejects(parseSourcePage({ url, html: shell }, "官网", AbortSignal.abort()));
  assert.equal(calls, beforeAbort);
});
