import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import ipaddr from "ipaddr.js";
import { Agent, fetch as secureFetch } from "undici";
import * as cheerio from "cheerio";
import { Run, Source, Settings, topics } from "@/lib/domain";

export type Document = {
  url: string;
  title: string;
  text: string;
  publishedAt: string | null;
  source: string;
};
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
  url.hash = "";
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
        url = validateUrl(new URL(target, url).toString());
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
        /news|blog|press|article|release|research|product|solution|\/s\?/i.test(
          target.pathname + target.search,
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
  $("script,style,noscript,nav,footer,header,form,svg").remove();
  const article = $("article,main,#js_content").first();
  const text = (article.length ? article.text() : $("body").text())
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 10000);
  if (
    text.length < 120 ||
    /环境异常|访问过于频繁|完成验证/.test(text.slice(0, 500))
  )
    throw new Error("来源正文不可访问或需要平台验证，未绕过访问限制。");
  return {
    document: {
      url,
      title: title.trim().slice(0, 300),
      text,
      publishedAt,
      source,
    },
    links: [...new Set(links)].filter((l) => l !== url),
  };
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
  const parsed = parsePage(page.html, page.url, source.name);
  const docs = [parsed.document];
  const more = await Promise.allSettled(
    parsed.links.slice(0, deep ? 3 : 1).map(async (link) => {
      const p = await fetchPage(link, signal);
      return parsePage(p.html, p.url, source.name).document;
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
};

export type DiscoveryCandidate = DiscoveryQuery & { url: string };
export type DiscoveryResult = {
  candidates: DiscoveryCandidate[];
  queryCount: number;
  resultCount: number;
  deduplicatedCount: number;
  failedQueries: number;
};

const query = (
  lane: DiscoveryLane,
  coverageKey: string,
  value: string,
  topic: DiscoveryQuery["topic"] = "news",
): DiscoveryQuery => ({ lane, coverageKey, query: value, topic });

export function buildDiscoveryPlan(
  settings: Settings,
  mode: Run["mode"] = "incremental",
  supplemental: DiscoveryQuery[] = [],
) {
  const plan: DiscoveryQuery[] = [
    query(
      "常规行业扫描",
      "行业动态",
      '("industrial AI" OR "工业人工智能" OR "工业软件" OR "工业互联网") (产品发布 OR 技术突破 OR 融资 OR 并购)',
    ),
    query(
      "常规行业扫描",
      "前沿技术",
      '("manufacturing AI" OR "physical AI" OR "3D AI" OR "digital twin") (research OR benchmark OR platform OR release)',
      "general",
    ),
    query(
      "常规行业扫描",
      "产品与方案",
      '(工业智能 OR industrial intelligence OR industrial agent) (产品 OR 平台 OR 解决方案 OR customer case)',
    ),
    query(
      "常规行业扫描",
      "企业战略",
      '(工业软件 OR industrial AI OR manufacturing AI) (战略 OR 定位 OR 合作 OR 生态 OR partnership)',
    ),
    query(
      "常规行业扫描",
      "产业市场",
      '(工业智能 OR 工业软件 OR manufacturing AI) (政策 OR 市场 OR 产业 OR 报告 OR adoption)',
    ),
    query(
      "常规行业扫描",
      "资本市场",
      '(工业软件 OR manufacturing AI OR 3D AI) (融资 OR 投资 OR 并购 OR acquisition OR funding)',
    ),
  ];
  for (const direction of topics)
    plan.push(
      query(
        "常规行业扫描",
        `方向:${direction}`,
        `"${direction}" (研究 OR 技术突破 OR 产品 OR 解决方案 OR 应用 OR 融资)`,
        mode === "full" ? "general" : "news",
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
      ),
    );
  }
  for (let index = 0; index < settings.companies.length; index += 3) {
    const companies = settings.companies.slice(index, index + 3);
    const companyExpression = companies
      .map((company) => `"${company}"`)
      .join(" OR ");
    plan.push(
      query(
        "重点企业追踪",
        `企业:${companies.join("、")}`,
        `(${companyExpression}) (战略 OR 定位 OR 产品 OR 技术 OR 合作 OR 客户)`,
      ),
    );
    if (mode === "full")
      plan.push(
        query(
          "重点企业追踪",
          `企业资本:${companies.join("、")}`,
          `(${companyExpression}) (融资 OR 投资 OR 并购 OR 收购 OR 财报 OR 市场份额)`,
        ),
      );
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
  for (const domain of domains)
    plan.push(
      query(
        "指定网站发现",
        `网站:${domain}`,
        `site:${domain} (news OR research OR product OR solution OR 新闻 OR 研究 OR 产品)`,
        "general",
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
    };
  const plan = supplementalOnly
    ? [
        ...new Map(
          supplemental.map((entry) => [entry.query.toLowerCase(), entry]),
        ).values(),
      ].slice(0, 12)
    : buildDiscoveryPlan(settings, mode, supplemental);
  const results: DiscoveryCandidate[] = [];
  let resultCount = 0;
  let failedQueries = 0;
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
            search_depth: "advanced",
            chunks_per_source: 3,
            max_results: mode === "full" ? 10 : 8,
            topic: entry.topic,
            start_date: startDate,
          }),
          signal: AbortSignal.any([signal, AbortSignal.timeout(25000)]),
        });
        if (!response.ok)
          throw new Error(`搜索服务返回 HTTP ${response.status}。`);
        const body = (await response.json()) as {
          results?: { url?: unknown }[];
        };
        const candidates: DiscoveryCandidate[] = [];
        for (const item of body.results ?? []) {
          resultCount++;
          if (typeof item.url !== "string") continue;
          try {
            candidates.push({ ...entry, url: canonicalUrl(item.url) });
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
  const candidates = [
    ...new Map(results.map((result) => [result.url, result])).values(),
  ];
  return {
    candidates,
    queryCount: plan.length,
    resultCount,
    deduplicatedCount: candidates.length,
    failedQueries,
  };
}
