import { createClient } from "@supabase/supabase-js";
import { mkdir, readFile, writeFile, rename, rmdir } from "node:fs/promises";
import path from "node:path";
import {
  Database,
  Dashboard,
  Item,
  Profile,
  normalizeCategory,
  providers,
  mergeProfiles,
  normalizeItemDate,
} from "@/lib/domain";
import { identityText } from "@/lib/identity";
import { currentInsights } from "./synthesis";
import { emptyDatabase } from "@/lib/seed";

const dataFolder = () => path.join(process.cwd(), ".data");
export function isCloud() {
  return Boolean(
    process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}
function client() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
function localAllowed() {
  if (process.env.VERCEL)
    throw new Error(
      "尚未连接 Supabase，请配置 SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY。",
    );
}
// A one-way compatibility cleanup for workspaces created before demo content
// was removed. The cleaned snapshot is persisted on the next mutation.
function removeLegacyDemoContent(db: Database): Database {
  const items = db.items
    .filter((item) => (item as Item & { demo?: unknown }).demo !== true)
    .map((item) => normalizeItemDate({ ...item, category: normalizeCategory(String(item.category)) },
      db.runs.find((run) => run.id === item.runId)?.startedAt));
  const profiles = db.profiles.filter(
    (profile) => (profile as Profile & { demo?: unknown }).demo !== true,
  );
  const legacyModels: Record<string, string> = {
    "deepseek-chat": providers.deepseek.model,
    "deepseek-reasoner": providers.deepseek.model,
    "glm-4-plus": providers.glm.model,
  };
  const models = Object.fromEntries(
    Object.entries(db.settings.models).map(([id, model]) => [
      id,
      legacyModels[model] ?? model,
    ]),
  ) as Database["settings"]["models"];
  const sources = db.settings.sources.filter(
    (source) => (source as { kind: string }).kind !== "wechat",
  );
  return {
    ...db,
    settings: { ...db.settings, models, sources },
    items,
    profiles,
  };
}

export function dashboardProfiles(db: Database, now = new Date()) {
  const valid = mergeProfiles([], db.profiles.filter((profile) => profile.evidence.length));
  const byName = new Map(
    valid.map((profile) => [identityText(profile.name), profile]),
  );
  const configured = db.settings.companies.map((name) => {
    const key = identityText(name);
    const profile = byName.get(key);
    if (profile) {
      byName.delete(key);
      return profile;
    }
    return {
      id: `configured-${encodeURIComponent(key)}`,
      name,
      narrative: "尚未获得可核验官网资料，请核对来源配置中的企业官网后开展研究。",
      positioning: "企业官网研究待完成",
      solutions: [], capabilities: [],
      funding: "未披露",
      implication: "持续跟踪技术、产品、战略与资本变化。",
      evidence: [], updatedAt: now.toISOString(),
    } satisfies Profile;
  });
  return [...configured, ...byName.values()];
}
export function publishedSnapshot(db: Pick<Database, "items" | "insights">) {
  // The dashboard is a published research snapshot. Retention and deduplication
  // run atomically in the publish node, never as a side effect of page reads.
  const items = db.items;
  return { items, insights: currentInsights(db.insights, items) };
}
async function cloudRow() {
  const db = client();
  let { data, error } = await db
    .from("research_workspace")
    .select("version,payload")
    .eq("id", "main")
    .maybeSingle();
  if (error) throw new Error("Supabase 读取失败，请检查连接与 schema 初始化。");
  if (!data) {
    const result = await db
      .from("research_workspace")
      .upsert(
        { id: "main", version: 0, payload: emptyDatabase() },
        { onConflict: "id", ignoreDuplicates: true },
      );
    if (result.error) throw new Error("Supabase 初始化失败。");
    const row = await db
      .from("research_workspace")
      .select("version,payload")
      .eq("id", "main")
      .single();
    data = row.data;
    error = row.error;
  }
  if (error || !data) throw new Error("Supabase 工作区不存在。");
  const row = data as { version: number; payload: Database };
  return { ...row, payload: removeLegacyDemoContent(row.payload) };
}
export async function readDatabase(): Promise<Database> {
  if (isCloud()) return (await cloudRow()).payload;
  localAllowed();
  try {
    return removeLegacyDemoContent(JSON.parse(
      await readFile(path.join(dataFolder(), "workspace.json"), "utf8"),
    ));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return emptyDatabase();
  }
}
// CAS provides a transaction boundary for runs, credentials and fused publications.
// Local mode uses an exclusive filesystem lock; production never uses ephemeral disk.
export async function mutateDatabase<T>(
  mutate: (db: Database) => T,
): Promise<T> {
  if (isCloud()) {
    for (let attempt = 0; attempt < 12; attempt++) {
      const row = await cloudRow();
      const result = mutate(row.payload);
      const { data, error } = await client()
        .from("research_workspace")
        .update({ version: row.version + 1, payload: row.payload })
        .eq("id", "main")
        .eq("version", row.version)
        .select("version");
      if (error) throw new Error("Supabase 保存失败。");
      if (data?.length) return result;
    }
    throw new Error("同时写入较多，请稍后重试。");
  }
  const folder = dataFolder();
  const filename = path.join(folder, "workspace.json");
  localAllowed();
  await mkdir(folder, { recursive: true });
  const lock = path.join(folder, "write.lock");
  let locked = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      await mkdir(lock);
      locked = true;
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      await new Promise((r) => setTimeout(r, 30));
    }
  }
  if (!locked)
    throw new Error(
      "本地工作区忙，请重试；若进程异常退出，请清理 .data/write.lock 空目录。",
    );
  try {
    const db = await readDatabase();
    const result = mutate(db);
    const tmp = `${filename}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(db), { mode: 0o600 });
    await rename(tmp, filename);
    return result;
  } finally {
    await rmdir(lock);
  }
}
export async function dashboard(editable = false): Promise<Dashboard> {
  let db = await readDatabase();
  if (
    db.runs.some(
      (r) =>
        r.status === "running" && Date.now() - Date.parse(r.startedAt) > 360000,
    )
  ) {
    await mutateDatabase((current) => {
      for (const run of current.runs)
        if (
          run.status === "running" &&
          Date.now() - Date.parse(run.startedAt) > 360000
        ) {
          run.status = "failed";
          run.error = "执行进程已中断或超时，可从检查点恢复。";
          run.finishedAt = new Date().toISOString();
        }
    });
    db = await readDatabase();
  }
  const snapshot = publishedSnapshot(db);
  return {
    insights: snapshot.insights,
    settings: db.settings,
    configured: Object.fromEntries(
      Object.entries(db.credentials).map(([k, v]) => [k, Boolean(v)]),
    ),
    items: snapshot.items,
    profiles: dashboardProfiles(db),
    runs: db.runs.slice(-40).reverse(),
    storage: isCloud() ? "supabase" : "local",
    editable,
  };
}
