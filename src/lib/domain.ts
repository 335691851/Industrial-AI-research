import { z } from "zod";
import { evidenceUrl, identityText, textSimilarity } from "./identity";

export const topics = [
  "工业互联网",
  "工业智能",
  "3D 模型 + AI",
  "制造业 + AI",
  "数字孪生",
  "智能运维",
] as const;
export const categories = [
  "技术前沿",
  "产品发布",
  "解决方案",
  "企业战略",
  "产业市场",
  "资本动态",
] as const;
export const providerIds = ["deepseek", "openai", "glm", "qwen"] as const;
export type ProviderId = (typeof providerIds)[number];
export const providers: Record<
  ProviderId,
  {
    name: string;
    baseUrl: string;
    model: string;
    color: string;
    models: { id: string; label: string }[];
  }
> = {
  deepseek: {
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-v4-flash",
    color: "#638aff",
    models: [
      { id: "deepseek-v4-flash", label: "DeepSeek V4 Flash" },
      { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro" },
    ],
  },
  openai: {
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4.1-mini",
    color: "#65d7b8",
    models: [
      { id: "gpt-4.1-mini", label: "GPT-4.1 mini" },
      { id: "gpt-4.1", label: "GPT-4.1" },
    ],
  },
  glm: {
    name: "GLM · 智谱",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    model: "glm-5.2",
    color: "#a692ff",
    models: [
      { id: "glm-5.2", label: "GLM-5.2" },
    ],
  },
  qwen: {
    name: "Qwen · 通义千问",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen3.7-plus",
    color: "#bc92f9",
    models: [
      { id: "qwen3.7-plus", label: "Qwen3.7 Plus" },
      { id: "qwen3.8-max", label: "Qwen3.8 Max" },
      { id: "qwen-plus", label: "Qwen Plus（兼容）" },
    ],
  },
};
export const sourceSchema = z.object({
  id: z.string().max(100),
  name: z.string().trim().min(1).max(100),
  url: z.url().max(2000),
  kind: z.enum(["website", "rss"]),
  enabled: z.boolean(),
});
export const settingsSchema = z.object({
  revision: z.number().int().nonnegative(),
  keywords: z.array(z.string().trim().min(1).max(100)).max(50),
  companies: z.array(z.string().trim().min(1).max(100)).max(30),
  companyWebsites: z.record(z.string().max(100), z.url().max(2000)).optional(),
  sources: z.array(sourceSchema).max(30),
  selectedProvider: z.enum(providerIds),
  models: z.object({
    deepseek: z.string().min(1).max(100),
    openai: z.string().min(1).max(100),
    glm: z.string().min(1).max(100),
    qwen: z.string().min(1).max(100),
  }),
}).superRefine((settings, context) => {
  for (const provider of providerIds) {
    if (!providers[provider].models.some(({ id }) => id === settings.models[provider]))
      context.addIssue({
        code: "custom",
        path: ["models", provider],
        message: `${providers[provider].name} 模型名称不在当前支持列表中`,
      });
  }
});
export type Settings = z.infer<typeof settingsSchema>;
export type Source = z.infer<typeof sourceSchema>;
export type Evidence = { url: string; title: string; quote: string };
export type Item = {
  id: string;
  title: string;
  summary: string;
  implication: string;
  category: (typeof categories)[number];
  topic: (typeof topics)[number];
  importance: "critical" | "high" | "normal";
  company: string;
  publishedAt: string | null;
  effectiveAt?: string;
  dateBasis?: "published" | "observed";
  observedAt: string;
  confidence: number;
  evidence: Evidence[];
  runId: string;
  eventKey: string;
};
export type Profile = {
  id: string;
  name: string;
  narrative: string;
  positioning: string;
  solutions: string[];
  capabilities: string[];
  funding: string;
  implication: string;
  evidence: Evidence[];
  updatedAt: string;
  basis?: "official";
};
export type Run = {
  id: string;
  date: string;
  mode: "incremental" | "full";
  status: "running" | "completed" | "partial" | "failed";
  startedAt: string;
  finishedAt?: string;
  provider: string;
  model: string;
  events: {
    at: string;
    node: string;
    message: string;
    status: "ok" | "warning" | "error";
  }[];
  itemCount: number;
  sourceStats?: {
    queryCount: number;
    searchResults: number;
    deduplicated: number;
    read: number;
    effective: number;
    failed: number;
    analyzed: number;
  };
  error?: string;
};
export type ResearchArchive = {
  id: string;
  archivedAt: string;
  runId: string;
  items: Item[];
  profiles: Profile[];
};
export type Database = {
  settings: Settings;
  credentials: Partial<Record<ProviderId, string>>;
  items: Item[];
  profiles: Profile[];
  runs: Run[];
  archives?: ResearchArchive[];
};
export type Dashboard = {
  items: Item[];
  profiles: Profile[];
  runs: Run[];
  settings: Settings;
  configured: Partial<Record<ProviderId, boolean>>;
  storage: "local" | "supabase";
  editable: boolean;
};

export const INTELLIGENCE_WINDOW_DAYS = 30;

export function validDate(value: string | null | undefined) {
  return Boolean(value && Number.isFinite(Date.parse(value)));
}
export function effectiveDate(item: Item) {
  return validDate(item.publishedAt) ? item.publishedAt! :
    validDate(item.effectiveAt) ? item.effectiveAt! : item.observedAt;
}
export function normalizeItemDate(item: Item, generatedAt = new Date().toISOString()): Item {
  const publishedAt = validDate(item.publishedAt) ? item.publishedAt! : null;
  const observedAt = validDate(item.observedAt) ? new Date(item.observedAt).toISOString() : generatedAt;
  const fallback = validDate(item.effectiveAt) ? new Date(item.effectiveAt!).toISOString() : observedAt;
  return { ...item, publishedAt, observedAt, effectiveAt: publishedAt ?? fallback,
    dateBasis: publishedAt ? "published" : "observed" };
}

const legacyCategories: Record<string, Item["category"]> = {
  前沿研究: "技术前沿",
  重大成果: "技术前沿",
  产品方案: "解决方案",
  行业新闻: "产业市场",
  企业动态: "企业战略",
  投融资: "资本动态",
};

export function normalizeCategory(value: string): Item["category"] {
  if ((categories as readonly string[]).includes(value))
    return value as Item["category"];
  return legacyCategories[value] ?? "产业市场";
}

export function recentIntelligence(item: Item, now = new Date()) {
  const date = Date.parse(effectiveDate(item));
  return (
    Number.isFinite(date) &&
    date <= now.getTime() &&
    date >= now.getTime() - INTELLIGENCE_WINDOW_DAYS * 86400000
  );
}

// Compatibility name for callers created before the unified 30-day window.
export const recentNews = recentIntelligence;

export function priorityScore(item: Item, now = new Date()) {
  const importance = { critical: 42, high: 24, normal: 0 }[item.importance];
  const evidence = Math.min(new Set(item.evidence.map((e) => evidenceUrl(e.url))).size, 4) * 6;
  const confidence = Math.round(item.confidence * 20);
  const date = Date.parse(effectiveDate(item));
  const ageDays = Number.isFinite(date)
    ? Math.max(0, (now.getTime() - date) / 86400000)
    : INTELLIGENCE_WINDOW_DAYS;
  return importance + evidence + confidence + Math.max(0, 14 - ageDays / 2);
}

export function isMajorSignal(item: Item) {
  const sourceCount = new Set(item.evidence.map((e) => evidenceUrl(e.url))).size;
  return (
    (item.importance === "critical" && item.confidence >= 0.72 && item.evidence.length >= 1) ||
    (item.importance === "high" && item.confidence >= 0.82 && sourceCount >= 2)
  );
}

export function prioritySignals(items: Item[], now = new Date()) {
  return items
    .filter(isMajorSignal)
    .sort((a, b) => priorityScore(b, now) - priorityScore(a, now));
}
export function mergeItems(existing: Item[], incoming: Item[]) {
  const map = new Map<string, Item>();
  for (const item of [...existing, ...incoming]) {
    const prior = map.get(item.eventKey) ?? [...map.values()].find((other) => sameEvent(other, item));
    if (prior) {
      const evidence = [...prior.evidence, ...item.evidence].filter(
        (e, i, all) =>
          all.findIndex((a) => evidenceUrl(a.url) === evidenceUrl(e.url) && a.quote === e.quote) === i,
      );
      // Do not re-date an event just because it was rediscovered.
      map.set(prior.eventKey, normalizeItemDate({
        ...(item.confidence > prior.confidence ? item : prior),
        id: prior.id,
        eventKey: prior.eventKey,
        observedAt: prior.observedAt < item.observedAt ? prior.observedAt : item.observedAt,
        effectiveAt: effectiveDate(prior),
        publishedAt: prior.publishedAt ?? item.publishedAt,
        evidence,
      }));
    } else map.set(item.eventKey, normalizeItemDate(item));
  }
  return [...map.values()].sort((a, b) =>
    b.observedAt.localeCompare(a.observedAt),
  );
}
export function mergeProfiles(existing: Profile[], incoming: Profile[]) {
  const map = new Map(existing.map((p) => [identityText(p.name), p]));
  for (const p of incoming) {
    const old = map.get(identityText(p.name));
    if (old?.basis === "official" && p.basis !== "official") continue;
    if (old?.evidence.length && !p.evidence.length) continue;
    map.set(
      identityText(p.name),
      old && !(p.basis === "official" && old.basis !== "official")
        ? {
            ...p,
            narrative: p.narrative || old.narrative,
            positioning: p.positioning || old.positioning,
            solutions: [...new Set([...old.solutions, ...p.solutions])],
            capabilities: [
              ...new Set([...old.capabilities, ...p.capabilities]),
            ],
            funding: p.funding === "未披露" ? old.funding : p.funding,
            evidence: [...old.evidence, ...p.evidence].filter(
              (e, i, a) =>
                a.findIndex((v) => v.url === e.url && v.quote === e.quote) ===
                i,
            ),
          }
        : p,
    );
  }
  return [...map.values()];
}

export function sameEvent(a: Item, b: Item) {
  const companyA = identityText(a.company), companyB = identityText(b.company);
  if (companyA && companyB && companyA !== "行业" && companyB !== "行业" && companyA !== companyB &&
    !identityText(`${a.title} ${a.summary}`).includes(companyB) &&
    !identityText(`${b.title} ${b.summary}`).includes(companyA)) return false;
  const dateA = Date.parse(effectiveDate(a));
  const dateB = Date.parse(effectiveDate(b));
  const datedApart = Math.abs(dateA - dateB) > 7 * 86400000;
  if (!Number.isFinite(dateA) || !Number.isFinite(dateB)) return false;
  const titleSimilarity = textSimilarity(a.title, b.title);
  const summarySimilarity = textSimilarity(a.summary, b.summary);
  const sharedQuote = a.evidence.some((left) => b.evidence.some((right) =>
    identityText(left.quote).length >= 24 && textSimilarity(left.quote, right.quote) >= .85));
  const sharedPage = a.evidence.some((left) => b.evidence.some((right) => evidenceUrl(left.url) === evidenceUrl(right.url)));
  // Undated rediscoveries may be weeks apart; require the same page AND quotation.
  if (datedApart && (validDate(a.publishedAt) && validDate(b.publishedAt) || !sharedPage || !sharedQuote)) return false;
  // A page can cover many events: sharing a URL alone never merges them.
  return titleSimilarity >= .82 || summarySimilarity >= .8 ||
    (titleSimilarity >= .48 && summarySimilarity >= .5) ||
    (sharedQuote && (titleSimilarity >= .28 || summarySimilarity >= .35)) ||
    (sharedPage && titleSimilarity >= .52);
}

export function rebuildItems(existing: Item[], incoming: Item[], now = new Date()) {
  // Full research replaces coverage, but rediscovery must not restart the retention clock.
  const matched = existing.filter((old) => incoming.some((item) => old.eventKey === item.eventKey || sameEvent(old, item)));
  return mergeItems(matched, incoming).filter((item) => recentIntelligence(item, now));
}
