import { z } from "zod";

export const topics = [
  "工业互联网",
  "工业智能",
  "3D 模型 + AI",
  "制造业 + AI",
  "数字孪生",
  "智能运维",
] as const;
export const categories = [
  "前沿研究",
  "重大成果",
  "产品方案",
  "行业新闻",
  "企业动态",
  "投融资",
] as const;
export const providerIds = ["deepseek", "openai", "glm", "qwen"] as const;
export type ProviderId = (typeof providerIds)[number];
export const providers: Record<
  ProviderId,
  { name: string; baseUrl: string; model: string; color: string }
> = {
  deepseek: {
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-chat",
    color: "#638aff",
  },
  openai: {
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4.1-mini",
    color: "#65d7b8",
  },
  glm: {
    name: "GLM · 智谱",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    model: "glm-4-plus",
    color: "#a692ff",
  },
  qwen: {
    name: "Qwen · 通义千问",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen-plus",
    color: "#bc92f9",
  },
};
export const sourceSchema = z.object({
  id: z.string().max(100),
  name: z.string().trim().min(1).max(100),
  url: z.url().max(2000),
  kind: z.enum(["website", "wechat", "rss"]),
  enabled: z.boolean(),
});
export const settingsSchema = z.object({
  revision: z.number().int().nonnegative(),
  keywords: z.array(z.string().trim().min(1).max(100)).max(50),
  companies: z.array(z.string().trim().min(1).max(100)).max(30),
  sources: z.array(sourceSchema).max(30),
  selectedProvider: z.enum(providerIds),
  models: z.object({
    deepseek: z.string().min(1).max(100),
    openai: z.string().min(1).max(100),
    glm: z.string().min(1).max(100),
    qwen: z.string().min(1).max(100),
  }),
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
  observedAt: string;
  confidence: number;
  evidence: Evidence[];
  demo?: boolean;
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
  demo?: boolean;
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
  error?: string;
};
export type Database = {
  settings: Settings;
  credentials: Partial<Record<ProviderId, string>>;
  items: Item[];
  profiles: Profile[];
  runs: Run[];
};
export type Dashboard = {
  items: Item[];
  profiles: Profile[];
  runs: Run[];
  settings: Settings;
  configured: Partial<Record<ProviderId, boolean>>;
  storage: "local" | "supabase" | "preview";
  demo: boolean;
  editable: boolean;
};

export function recentNews(item: Item, now = new Date()) {
  if (!["行业新闻", "企业动态", "投融资"].includes(item.category)) return true;
  if (!item.publishedAt) return false;
  const date = Date.parse(item.publishedAt);
  return (
    Number.isFinite(date) &&
    date <= now.getTime() &&
    date >= now.getTime() - 5 * 86400000
  );
}
export function mergeItems(existing: Item[], incoming: Item[]) {
  const map = new Map(existing.map((i) => [i.eventKey, i]));
  for (const item of incoming) {
    const prior = map.get(item.eventKey);
    if (prior) {
      const evidence = [...prior.evidence, ...item.evidence].filter(
        (e, i, all) =>
          all.findIndex((a) => a.url === e.url && a.quote === e.quote) === i,
      );
      // Do not re-date an event just because it was rediscovered.
      map.set(item.eventKey, {
        ...item,
        id: prior.id,
        publishedAt: prior.publishedAt ?? item.publishedAt,
        evidence,
      });
    } else map.set(item.eventKey, item);
  }
  return [...map.values()].sort((a, b) =>
    b.observedAt.localeCompare(a.observedAt),
  );
}
export function mergeProfiles(existing: Profile[], incoming: Profile[]) {
  const map = new Map(existing.map((p) => [p.id, p]));
  for (const p of incoming) {
    const old = map.get(p.id);
    map.set(
      p.id,
      old
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
