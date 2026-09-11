import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import ipaddr from "ipaddr.js";
import { Agent, fetch as secureFetch } from "undici";
import * as cheerio from "cheerio";
import { Run, Source, Settings, topics } from "@/lib/domain";
import {
  isOfficialSource,
  isTrustedSource,
  primarySearchDomains,
  trustedSearchDomains,
} from "@/lib/source-policy";
import {
  belongsToWebsite,
  companySearchTerms,
  identityText,
  normalizePageFragment,
  officialWebsite,
} from "@/lib/identity";

export type Document = {
  url: string;
  title: string;
  text: string;
  publishedAt: string | null;
  source: string;
  profileCompany?: string;
  focusCompany?: string;
  retrievalMethod?: "html" | "advanced-extract" | "advanced-search" | "search-raw-content" | "official-homepage-fallback";
};
export class SourceContentError extends Error {
  constructor(public readonly reason: "dynamic" | "empty" | "restricted", message: string) {
    super(message);
    this.name = "SourceContentError";
  }
}
export function publicAddress(address: string) {
  try {
    const ip = ipaddr.process(address);
    return ip.range() === "unicast";
  } catch {
    return false;
  }
}
export function validateUrl(value: string) {
  const url = new URL(value);
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && !["80", "443"].includes(url.port))
  )
    throw new Error("来源网址仅支持标准 HTTP / HTTPS 公网地址。");
  if (
    hostname === "localhost" ||
    hostname.endsWith(".local") ||
    !hostname.includes(".") ||
    (isIP(hostname) && !publicAddress(hostname))
  )
    throw new Error("来源网址不能指向本地或内网。");
  return url;
}
export function canonicalUrl(value: string) {
  const url = validateUrl(value);
  normalizePageFragment(url);
  for (const key of [...url.searchParams.keys()])
    if (/^utm_|^(fbclid|gclid)$/i.test(key)) url.searchParams.delete(key);
  url.searchParams.sort();
  return url.toString();
}
export async function fetchPage(
  value: string,
  signal: AbortSignal,
): Promise<{ html: string; url: string }> {
  let url = validateUrl(value);
  for (let redirects = 0; redirects < 4; redirects++) {
    const hostname = url.hostname.replace(/^\[|\]$/g, "");
    const addresses = await lookup(hostname, { all: true });
    if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
      throw new Error("来源解析到非公网地址，已阻止。");
    // Pin DNS to a verified IP for this connection, preventing DNS rebinding.
    const dispatcher = new Agent({
      connect: {
        lookup: (_hostname, options, cb) => {
          const address = addresses[0];
          if (options.all) cb(null, [address]);
          else cb(null, address.address, address.family);
        },
      },
    });
    try {
      const response = await secureFetch(url, {
        dispatcher,
        redirect: "manual",
        signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
        headers: {
          "User-Agent":
            "ChichengResearch/1.0 (+industry research; public pages only)",
          Accept:
            "text/html,application/rss+xml,application/atom+xml,application/xml",
        },
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const target = response.headers.get("location");
        await response.body?.cancel();
        if (!target) throw new Error("来源重定向缺少目标。");
        const redirected = new URL(target, url);
        if (!target.includes("#")) redirected.hash = url.hash;
        url = validateUrl(redirected.toString());
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`来源返回 HTTP ${response.status}。`);
      }
      if (
        !/text|xml|html|json/i.test(response.headers.get("content-type") ?? "")
      ) {
        await response.body?.cancel();
        throw new Error("来源格式暂不支持，请配置网页或 RSS。");
      }
      const reader = response.body!.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 1800000) {
          await reader.cancel();
          throw new Error("来源页面过大，已跳过。");
        }
        chunks.push(value);
      }
      return {
        html: Buffer.concat(chunks).toString("utf8"),
        url: canonicalUrl(url.toString()),
      };
    } finally {
      await dispatcher.close();
    }
  }
  throw new Error("来源重定向次数超限。");
}
export function parsePage(
  html: string,
  url: string,
  source: string,
): { document: Document; links: string[] } {
  const $ = cheerio.load(html);
  const date =
    $('meta[property="article:published_time"]').attr("content") ||
    $('meta[name="date"]').attr("content") ||
    $("time[datetime]").first().attr("datetime");
  let publishedAt: string | null =
    date && Number.isFinite(Date.parse(date))
      ? new Date(date).toISOString()
      : null;
  if (!publishedAt) {
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const json = JSON.parse($(el).text());
        const candidates = Array.isArray(json)
          ? json
          : [json, ...(json["@graph"] ?? [])];
        const d = candidates.find((v) => v.datePublished)?.datePublished;
        if (d && Number.isFinite(Date.parse(d)))
          publishedAt = new Date(d).toISOString();
      } catch {
        /* Invalid publisher metadata is not a publication date. */
      }
    });
  }
  const links: string[] = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    try {
      const target = new URL(href, url);
      if (
        target.hostname === new URL(url).hostname &&
        /about|company|capabilit|technolog|news|blog|press|article|release|research|product|solution|\/s\?/i.test(
          target.pathname + target.search + target.hash,
        )
      )
        links.push(canonicalUrl(target.toString()));
    } catch {
      /* Ignore unsupported links. */
    }
  });
  const title =
    $('meta[property="og:title"]').attr("content") ||
    $("h1").first().text() ||
    $("title").text();
  const dynamicShell = /enable javascript|javascript (?:is )?(?:required|disabled)|without javascript|启用\s*javascript/i.test($("noscript").text()) ||
    ($("script[src]").length > 0 && $("#app,#__next,#root").length > 0);
  $("script,style,noscript,nav,footer,header,form,svg").remove();
  const article = $("article,main,#js_content").first();
  const text = (article.length ? article.text() : $("body").text())
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 10000);
  assertNotRestricted(`${title} ${text}`);
  if (text.length < 120) {
    if (dynamicShell) throw new SourceContentError("dynamic", "来源为 JavaScript 动态页面，原始 HTML 未包含有效正文。");
    throw new SourceContentError("empty", "来源正文不足 120 字符，可能为空页或非正文页面。");
  }
  return {
    document: {
      url,
      title: title.trim().slice(0, 300),
      text,
      publishedAt,
      source,
      retrievalMethod: "html",
    },
    links: [...new Set(links)].filter((l) => l !== url),
  };
}

function assertNotRestricted(text: string) {
  if (/环境异常|访问过于频繁|完成验证|verify (?:you are|that you are) human|captcha|access denied|just a moment/i.test(text.slice(0, 500)))
    throw new SourceContentError("restricted", "来源要求访问验证或明确限制访问，已停止读取，未绕过访问限制。");
}

// Only called after the URL has passed the pinned-DNS fetch and returned a public page.
export async function extractDynamicPage(page: { html: string; url: string }, source: string, signal: AbortSignal, officialCompany?: string): Promise<Document> {
  signal.throwIfAborted();
  const target = canonicalUrl(page.url);
  if (!process.env.TAVILY_API_KEY)
    throw new SourceContentError("dynamic", "来源为 JavaScript 动态页面；请配置 TAVILY_API_KEY 以启用高级正文提取。");
  const response = await fetch("https://api.tavily.com/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.TAVILY_API_KEY}` },
    body: JSON.stringify({ urls: [target], extract_depth: "advanced", format: "text", timeout: 20, include_images: false }),
    signal: AbortSignal.any([signal, AbortSignal.timeout(25000)]),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`动态正文提取服务返回 HTTP ${response.status}，请检查提取服务配置或额度。`);
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("动态正文提取服务未返回内容。");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 1800000) { await reader.cancel(); throw new Error("动态正文提取响应过大，已跳过。"); }
    chunks.push(value);
  }
  const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { results?: { url?: unknown; raw_content?: unknown }[] };
  let fallback = false;
  const result = Array.isArray(body.results) ? body.results.find((entry) => {
    if (typeof entry.url !== "string") return false;
    try {
      const returned = canonicalUrl(entry.url);
      if (returned === target) return true;
      const targetUrl = new URL(target);
      const returnedUrl = new URL(returned);
      const targetWithoutFragment = new URL(target);
      targetWithoutFragment.hash = "";
      fallback = Boolean(
        officialCompany && /^#!?\//.test(targetUrl.hash) &&
        returned === canonicalUrl(targetWithoutFragment.toString()) &&
        returnedUrl.origin === targetUrl.origin,
      );
      return fallback;
    } catch { return false; }
  }) : undefined;
  if (!result) throw new Error("动态正文提取未返回对应页面；未将其他页面或首页内容作为该页面证据。");
  const text = typeof result.raw_content === "string" ? result.raw_content.replace(/\s+/g, " ").trim().slice(0, 10000) : "";
  assertNotRestricted(text);
  if (text.length < 120 || /without javascript|please enable javascript/i.test(text.slice(0, 500)))
    throw new Error("动态页面高级提取仍未取得有效正文，保留已有资料并等待后续刷新。");
  if (fallback && (!officialCompany || !identityText(text).includes(identityText(officialCompany))))
    throw new Error("动态路由仅返回官网首页，且正文未明确包含目标企业身份；未将首页作为该企业证据。");
  const $ = cheerio.load(page.html);
  const returnedUrl = typeof result.url === "string" ? canonicalUrl(result.url) : target;
  return { url: fallback ? returnedUrl : target, title: ($('meta[property="og:title"]').attr("content") || $("title").text() || source).trim().slice(0, 300), text, publishedAt: null, source, retrievalMethod: fallback ? "official-homepage-fallback" : "advanced-extract" };
}

export async function readSourcePage(value: string, source: string, signal: AbortSignal, officialWebsite?: string) {
  const page = await fetchPage(value, signal);
  if (officialWebsite && !belongsToWebsite(page.url, officialWebsite))
    throw new Error("企业官网跳转到其他域名，请核对官网地址。");
  return parseSourcePage(page, source, signal, officialWebsite ? source : undefined);
}

export async function parseSourcePage(page: { html: string; url: string }, source: string, signal: AbortSignal, officialCompany?: string) {
  let parsed: ReturnType<typeof parsePage> | undefined;
  try { parsed = parsePage(page.html, page.url, source); }
  catch (error) {
    if (!(error instanceof SourceContentError) || error.reason !== "dynamic") throw error;
  }
  // Even a populated HTML shell cannot prove the requested client-side route was rendered.
  if (parsed && !/^#!?\//.test(new URL(page.url).hash)) return parsed;
  return { document: await extractDynamicPage(page, source, signal, officialCompany), links: parsed?.links ?? [] };
}
export async function collectSource(
  source: Source,
  signal: AbortSignal,
  deep: boolean,
) {
  const page = await fetchPage(source.url, signal);
  if (source.kind === "rss") {
    const $ = cheerio.load(page.html, { xml: true });
    const docs: Document[] = [];
    $("item,entry")
      .slice(0, deep ? 6 : 3)
      .each((_, el) => {
        const item = $(el);
        const raw = item.find("link").attr("href") || item.find("link").text();
        const date = item.find("pubDate,published,updated").first().text();
        try {
          docs.push({
            url: canonicalUrl(raw),
            title: item.find("title").text(),
            text: cheerio
              .load(item.find("description,summary,content").first().text())
              .text()
              .replace(/\s+/g, " ")
              .slice(0, 10000),
            source: source.name,
            publishedAt:
              date && Number.isFinite(Date.parse(date))
                ? new Date(date).toISOString()
                : null,
          });
        } catch {
          /* Invalid RSS entries are skipped. */
        }
      });
    if (!docs.length) throw new Error("RSS 未解析到有效条目。");
    return docs;
  }
  const official = source.id.startsWith("official-company:");
  if (official && !belongsToWebsite(page.url, source.url))
    throw new Error("企业官网跳转到其他域名，请核对官网地址。");
  const parsed = await parseSourcePage(page, source.name, signal, official ? source.name : undefined);
  const docs = [parsed.document];
  const links = official
    ? parsed.links.filter((link) => /about|company|product|solution|technolog|capabilit/i.test(link))
    : parsed.links;
  const more = await Promise.allSettled(
    links.slice(0, official ? 2 : deep ? 3 : 1).map(async (link) => {
      return (await readSourcePage(link, source.name, signal, official ? source.url : undefined)).document;
    }),
  );
  for (const result of more)
    if (result.status === "fulfilled") docs.push(result.value);
  return docs;
}
export type DiscoveryLane =
  | "常规行业扫描"
  | "配置关键词扩展"
  | "重点企业追踪"
  | "指定网站发现"
  | "自主规划补充";
export type DiscoveryQuery = {
  lane: DiscoveryLane;
  query: string;
  topic: "news" | "general";
  coverageKey: string;
  focusCompany?: string;
  priority?: number;
  searchDepth?: "basic" | "advanced";
  sourceScope?: "primary" | "trusted";
  domains?: string[];
  domainMode?: "filter" | "boost";
  maxResults?: number;
};

export type DiscoveryCandidate = DiscoveryQuery & {
  url: string;
  title?: string;
  snippet?: string;
  rawContent?: string;
  publishedAt?: string | null;
  score?: number;
};

/**
 * Turn Tavily's cleaned source body into a traceable research document. Search
 * results have already passed URL validation and source-tier filtering, but we
 * still re-check both the publisher and focus-company identity at this trust
 * boundary. Search summaries are intentionally not accepted here.
 */
export function documentFromDiscoveryCandidate(
  candidate: DiscoveryCandidate,
  companyWebsiteOverrides?: Settings["companyWebsites"],
): Document | null {
  const body = candidate.rawContent?.replace(/\s+/g, " ").trim() ?? "";
  if (body.length < 160 || !isTrustedSource(candidate.url, companyWebsiteOverrides))
    return null;
  try { assertNotRestricted(body); }
  catch { return null; }
  if (candidate.focusCompany) {
    const website = officialWebsite(candidate.focusCompany, companyWebsiteOverrides);
    const officialPage = Boolean(website && belongsToWebsite(candidate.url, website));
    const namesCompany = identityText(`${candidate.title ?? ""} ${body}`)
      .includes(identityText(candidate.focusCompany));
    if (!officialPage && !namesCompany) return null;
  }
  return {
    url: candidate.url,
    title: candidate.title?.trim().slice(0, 300) || candidate.coverageKey,
    text: body.slice(0, 10000),
    publishedAt: candidate.publishedAt ?? null,
    source: `${candidate.lane} · ${candidate.coverageKey}`,
    focusCompany: candidate.focusCompany,
    retrievalMethod: "search-raw-content",
  };
}
export type DiscoveryResult = {
  candidates: DiscoveryCandidate[];
  queryCount: number;
  resultCount: number;
  deduplicatedCount: number;
  failedQueries: number;
  basicQueryCount: number;
  advancedQueryCount: number;
  estimatedCredits: number;
};

const query = (
  lane: DiscoveryLane,
  coverageKey: string,
  value: string,
  topic: DiscoveryQuery["topic"] = "news",
  options: Omit<DiscoveryQuery, "lane" | "coverageKey" | "query" | "topic"> = {},
): DiscoveryQuery => ({ lane, coverageKey, query: value, topic, ...options });

export function buildDiscoveryPlan(
  settings: Settings,
  mode: Run["mode"] = "incremental",
  supplemental: DiscoveryQuery[] = [],
) {
  const plan: DiscoveryQuery[] = [
    query(
      "常规行业扫描",
      "行业动态",
      '("industrial AI" OR "工业人工智能" OR "工业软件" OR "工业互联网") (发布 OR 技术突破 OR 客户落地 OR 融资 OR 并购)',
      "news",
      { searchDepth: "basic", sourceScope: "trusted", domainMode: "filter", maxResults: 12 },
    ),
    query(
      "常规行业扫描",
      "物理AI技术前沿",
      '("physical AI" OR embodied AI OR world model OR "neural simulator" OR "sim-to-real" OR synthetic data) (manufacturing OR industrial OR robotics) (research OR benchmark OR dataset OR framework OR release)',
      "general",
      { searchDepth: "advanced", sourceScope: "primary", domainMode: "filter", maxResults: 12 },
    ),
    query(
      "常规行业扫描",
      "工业智能衍生技术",
      '(industrial agent OR "manufacturing foundation model" OR "3D generative AI" OR neural operator OR differentiable simulation) (paper OR research OR benchmark OR open source)',
      "general",
      { searchDepth: "advanced", sourceScope: "primary", domainMode: "filter", maxResults: 12 },
    ),
    query(
      "常规行业扫描",
      "产品与方案",
      '(工业智能 OR industrial intelligence OR industrial agent) (产品 OR 平台 OR 解决方案 OR customer case)',
      "news",
      { searchDepth: "basic", sourceScope: "trusted", domainMode: "filter", maxResults: 12 },
    ),
    query(
      "常规行业扫描",
      "企业战略",
      '(工业软件 OR industrial AI OR manufacturing AI) (战略 OR 定位 OR 合作 OR 生态 OR partnership)',
      "news",
      { searchDepth: "basic", sourceScope: "trusted", domainMode: "filter", maxResults: 10 },
    ),
    query(
      "常规行业扫描",
      "全球工业龙头合作",
      '(Siemens OR ABB OR Schneider Electric OR Rockwell Automation OR Honeywell OR Bosch OR GE Vernova OR Mitsubishi Electric OR FANUC) (industrial AI OR manufacturing AI) (joint solution OR joint development OR deployment OR platform OR laboratory OR standard)',
      "news",
      { searchDepth: "basic", sourceScope: "primary", domainMode: "filter", maxResults: 16 },
    ),
    query(
      "常规行业扫描",
      "科技平台制造合作",
      '(NVIDIA OR Microsoft OR AWS OR IBM OR Google OR SAP OR Oracle OR Palantir) (manufacturing OR industrial) (AI platform OR digital twin OR simulation OR agent OR partnership OR deployment)',
      "news",
      { searchDepth: "basic", sourceScope: "primary", domainMode: "filter", maxResults: 16 },
    ),
    query(
      "常规行业扫描",
      "中国科技制造龙头",
      '(华为 OR 百度 OR 阿里云 OR 腾讯 OR 海尔卡奥斯 OR 三一重工 OR 徐工 OR 美的) (工业AI OR 工业智能 OR 制造业AI OR 物理AI OR 工业软件) (发布 OR 联合方案 OR 客户部署 OR 技术突破 OR 标准 OR 实验室)',
      "news",
      { searchDepth: "basic", sourceScope: "primary", domainMode: "filter", maxResults: 16 },
    ),
    query(
      "常规行业扫描",
      "工业软件生态合作",
      '(Dassault Systèmes OR Siemens OR PTC OR Autodesk OR Ansys OR AVEVA OR Hexagon) (AI OR digital twin OR simulation OR PLM OR CAD OR CAE) (release OR integration OR joint solution OR customer deployment)',
      "news",
      { searchDepth: "basic", sourceScope: "primary", domainMode: "filter", maxResults: 16 },
    ),
    query(
      "常规行业扫描",
      "产业市场",
      '(工业智能 OR 人工智能赋能新型工业化 OR 工业软件 OR 智能制造) (国家政策 OR 部委 OR 国务院 OR 工信部 OR 发改委 OR 标准 OR 试点 OR 专项行动)',
      "news",
      { searchDepth: "advanced", sourceScope: "primary", domainMode: "filter", maxResults: 14 },
    ),
    query(
      "常规行业扫描",
      "全球产业政策",
      '(manufacturing AI OR industrial AI OR advanced manufacturing) (government policy OR national strategy OR regulation OR public funding OR standard)',
      "news",
      { searchDepth: "advanced", sourceScope: "primary", domainMode: "filter", maxResults: 12 },
    ),
    query(
      "常规行业扫描",
      "资本市场",
      '(工业软件 OR manufacturing AI OR 3D AI) (融资 OR 投资 OR 并购 OR acquisition OR funding)',
      "news",
      { searchDepth: "advanced", sourceScope: "trusted", domainMode: "filter", maxResults: 12 },
    ),
  ];
  for (const direction of topics)
    plan.push(
      query(
        "常规行业扫描",
        `方向:${direction}`,
        `"${direction}" (研究 OR 技术突破 OR 产品 OR 解决方案 OR 应用 OR 融资)`,
        mode === "full" ? "general" : "news",
        { searchDepth: "basic", sourceScope: "trusted", domainMode: "filter", maxResults: 10 },
      ),
    );
  for (let index = 0; index < settings.keywords.length; index += 4) {
    const keywords = settings.keywords.slice(index, index + 4);
    plan.push(
      query(
        "配置关键词扩展",
        `关键词:${keywords.join("、")}`,
        `(${keywords.map((keyword) => `"${keyword}"`).join(" OR ")}) (研究 OR 技术 OR 产品 OR 应用 OR 市场 OR 融资)`,
        mode === "full" ? "general" : "news",
        { searchDepth: "basic", sourceScope: "trusted", domainMode: "filter", maxResults: 10 },
      ),
    );
  }
  // Every focus company receives its own result set. Sharing one 8/10-result
  // query across three companies allowed large brands to crowd out smaller but
  // strategically important companies.
  for (const company of settings.companies) {
    const companyExpression = companySearchTerms(company)
      .map((term) => `"${term}"`)
      .join(" OR ");
    plan.push(
      query(
        "重点企业追踪",
        `企业:${company}`,
        `(${companyExpression}) (产品发布 OR 新版本 OR 解决方案 OR 客户落地 OR 中标 OR 技术突破 OR 专利 OR 标准)`,
        "news",
        { focusCompany: company, priority: 3, searchDepth: "basic", sourceScope: "trusted", domainMode: "filter", maxResults: 10 },
      ),
    );
    plan.push(
      query(
        "重点企业追踪",
        `企业资本与战略:${company}`,
        `(${companyExpression}) (融资 OR 投资 OR 并购 OR 收购 OR 上市 OR 营收 OR 战略 OR 组织调整)`,
        "news",
        { focusCompany: company, priority: 4, searchDepth: "basic", sourceScope: "trusted", domainMode: "filter", maxResults: 8 },
      ),
    );
    const website = officialWebsite(company, settings.companyWebsites);
    if (website) {
      const domain = validateUrl(website).hostname.replace(/^www\./, "");
      plan.push(
        query(
          "重点企业追踪",
          `企业官网动态:${company}`,
          `site:${domain} (${companyExpression}) (news OR 新闻 OR 发布 OR 产品 OR 技术 OR 客户 OR 融资 OR 投资 OR 并购)`,
          "general",
          { focusCompany: company, priority: 5, searchDepth: "advanced", sourceScope: "primary", domains: [domain], domainMode: "filter", maxResults: 10 },
        ),
      );
    }
  }
  const domains = [
    ...new Set(
      settings.sources
        .filter((source) => source.enabled)
        .flatMap((source) => {
          try {
            return [validateUrl(source.url).hostname];
          } catch {
            return [];
          }
        }),
    ),
  ];
  for (const domain of domains.filter((domain) =>
    isTrustedSource(`https://${domain}`, settings.companyWebsites)))
    plan.push(
      query(
        "指定网站发现",
        `网站:${domain}`,
        `site:${domain} (news OR research OR product OR solution OR 新闻 OR 研究 OR 产品)`,
        "general",
        { searchDepth: "basic", sourceScope: "trusted", domains: [domain], domainMode: "filter", maxResults: 10 },
      ),
    );
  const combined = [...plan, ...supplemental].filter(
    (entry) => entry.query.trim().length >= 5,
  );
  return [
    ...new Map(
      combined.map((entry) => [entry.query.trim().toLowerCase(), entry]),
    ).values(),
  ].slice(0, 120);
}

export async function discover(
  settings: Settings,
  mode: Run["mode"],
  supplemental: DiscoveryQuery[],
  startDate: string,
  signal: AbortSignal,
  supplementalOnly = false,
): Promise<DiscoveryResult> {
  if (!process.env.TAVILY_API_KEY)
    return {
      candidates: [],
      queryCount: 0,
      resultCount: 0,
      deduplicatedCount: 0,
      failedQueries: 0,
      basicQueryCount: 0,
      advancedQueryCount: 0,
      estimatedCredits: 0,
    };
  const plan = supplementalOnly
    ? [
        ...new Map(
          supplemental.map((entry) => [entry.query.toLowerCase(), entry]),
        ).values(),
      ].slice(0, 12).map((entry) => ({ ...entry, searchDepth: "advanced" as const }))
    : buildDiscoveryPlan(settings, mode, supplemental);
  const results: DiscoveryCandidate[] = [];
  let resultCount = 0;
  let failedQueries = 0;
  const advancedQueryCount = plan.filter((entry) => entry.searchDepth === "advanced").length;
  const basicQueryCount = plan.length - advancedQueryCount;
  for (let index = 0; index < plan.length; index += 4) {
    signal.throwIfAborted();
    const group = plan.slice(index, index + 4);
    const settled = await Promise.allSettled(
      group.map(async (entry) => {
        const response = await fetch("https://api.tavily.com/search", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.TAVILY_API_KEY}`,
          },
          body: JSON.stringify({
            query: entry.query,
            search_depth: entry.searchDepth ?? "basic",
            chunks_per_source: 3,
            max_results: entry.maxResults ?? (mode === "full" ? 10 : 8),
            topic: entry.topic,
            start_date: startDate,
            include_published_date: true,
            // Tavily has already resolved and parsed these public pages. Keeping
            // the cleaned source body prevents an otherwise-valid result from
            // being lost when the publisher blocks our second HTTP fetch.
            include_raw_content: "text",
            safe_search: true,
            include_domains: entry.domains ?? (entry.sourceScope === "primary"
              ? primarySearchDomains(settings.companyWebsites)
              : trustedSearchDomains(settings.companyWebsites)),
            include_domains_mode: entry.domainMode ??
              "filter",
          }),
          signal: AbortSignal.any([signal, AbortSignal.timeout(25000)]),
        });
        if (!response.ok)
          throw new Error(`搜索服务返回 HTTP ${response.status}。`);
        const body = (await response.json()) as {
          results?: {
            url?: unknown;
            title?: unknown;
            content?: unknown;
            raw_content?: unknown;
            published_date?: unknown;
            score?: unknown;
          }[];
        };
        const candidates: DiscoveryCandidate[] = [];
        for (const item of body.results ?? []) {
          resultCount++;
          if (typeof item.url !== "string") continue;
          try {
            const url = canonicalUrl(item.url);
            const trusted = entry.sourceScope === "primary"
              ? isOfficialSource(url, settings.companyWebsites)
              : isTrustedSource(url, settings.companyWebsites);
            if (!trusted) continue;
            if (entry.domainMode === "filter" && entry.domains?.length &&
                !entry.domains.some((domain) => belongsToWebsite(url, `https://${domain}`)))
              continue;
            const title = typeof item.title === "string" ? item.title.trim() : undefined;
            const snippet = typeof item.content === "string" ? item.content.trim() : undefined;
            const rawContent = typeof item.raw_content === "string"
              ? item.raw_content.replace(/\s+/g, " ").trim().slice(0, 10000)
              : undefined;
            const publishedAt = typeof item.published_date === "string" &&
              Number.isFinite(Date.parse(item.published_date))
              ? new Date(item.published_date).toISOString()
              : null;
            const score = typeof item.score === "number" ? item.score : undefined;
            if (score !== undefined && score < 0.2) continue;
            if (entry.focusCompany) {
              const companyKey = identityText(entry.focusCompany);
              const resultText = identityText(`${title ?? ""} ${snippet ?? ""}`);
              const website = officialWebsite(entry.focusCompany, settings.companyWebsites);
              if (!resultText.includes(companyKey) && !(website && belongsToWebsite(url, website)))
                continue;
            }
            candidates.push({ ...entry, url, title, snippet, rawContent, publishedAt, score });
          } catch {
            /* Validate all search results before any server-side fetch. */
          }
        }
        return candidates;
      }),
    );
    for (const result of settled)
      if (result.status === "fulfilled") results.push(...result.value);
      else failedQueries++;
  }
  const byUrl = new Map<string, DiscoveryCandidate>();
  for (const result of results) {
    const current = byUrl.get(result.url);
    // The same page is often found by the broad scan first. Preserve the
    // dedicated-company context so later quota and coverage checks still know
    // which strategic company this document satisfies.
    if (!current || (result.priority ?? 0) > (current.priority ?? 0) ||
        (!current.focusCompany && result.focusCompany))
      byUrl.set(result.url, result);
  }
  const candidates = [...byUrl.values()];
  return {
    candidates,
    queryCount: plan.length,
    resultCount,
    deduplicatedCount: candidates.length,
    failedQueries,
    basicQueryCount,
    advancedQueryCount,
    estimatedCredits: basicQueryCount + advancedQueryCount * 2,
  };
}
