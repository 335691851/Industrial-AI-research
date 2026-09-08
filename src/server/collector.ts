import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import ipaddr from "ipaddr.js";
import { Agent, fetch as secureFetch } from "undici";
import * as cheerio from "cheerio";
import { Source, Settings } from "@/lib/domain";

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
export async function discover(settings: Settings, signal: AbortSignal) {
  if (!process.env.TAVILY_API_KEY) return [];
  const day = Math.floor(Date.now() / 86400000);
  const queries = [
    settings.keywords.slice(0, 6).join(" OR "),
    settings.companies
      .slice(day % Math.max(1, settings.companies.length))
      .concat(settings.companies)
      .slice(0, 4)
      .join(" OR ") + " 工业 AI 产品 融资",
  ];
  const urls: string[] = [];
  for (const query of queries) {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.TAVILY_API_KEY}`,
      },
      body: JSON.stringify({ query, max_results: 5, topic: "news", days: 5 }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
    });
    if (!response.ok) throw new Error(`搜索服务返回 HTTP ${response.status}。`);
    const body = await response.json();
    for (const r of body.results ?? []) {
      try {
        urls.push(canonicalUrl(r.url));
      } catch {
        /* Validate all search results. */
      }
    }
  }
  return [...new Set(urls)];
}
