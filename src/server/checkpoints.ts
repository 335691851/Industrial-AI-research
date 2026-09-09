import { MemorySaver } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { serialize, deserialize } from "node:v8";
import path from "node:path";

// Per-run local durable saver; v8 preserves Uint8Array checkpoint serialization.
class FileSaver extends MemorySaver {
  private queue: Promise<void> = Promise.resolve();
  constructor(private file: string) {
    super();
  }
  async load() {
    try {
      const data = deserialize(await readFile(this.file));
      this.storage = data.storage;
      this.writes = data.writes;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
  }
  private async persist() {
    this.queue = this.queue.then(async () => {
      await mkdir(path.dirname(this.file), { recursive: true });
      await writeFile(
        this.file + ".tmp",
        serialize({ storage: this.storage, writes: this.writes }),
        { mode: 0o600 },
      );
      await rename(this.file + ".tmp", this.file);
    });
    return this.queue;
  }
  override async put(...args: Parameters<MemorySaver["put"]>) {
    const result = await super.put(...args);
    await this.persist();
    return result;
  }
  override async putWrites(...args: Parameters<MemorySaver["putWrites"]>) {
    await super.putWrites(...args);
    await this.persist();
  }
}

export function checkpointError(error: unknown) {
  const codes: string[] = [];
  const messages: string[] = [];
  let current: unknown = error;
  for (
    let depth = 0;
    current && typeof current === "object" && depth < 5;
    depth++
  ) {
    const detail = current as {
      code?: unknown;
      message?: unknown;
      cause?: unknown;
    };
    if (typeof detail.code === "string") codes.push(detail.code);
    if (typeof detail.message === "string") messages.push(detail.message);
    current = detail.cause;
  }
  const message = messages.join(" ");
  if (
    codes.includes("28P01") ||
    /password authentication failed|Tenant or user not found/i.test(message)
  )
    return "DATABASE_URL 认证失败。请重新复制 Supabase Session pooler 连接串，并确认数据库密码已正确进行 URL 编码。";
  if (codes.includes("42501") || /permission denied/i.test(message))
    return "DATABASE_URL 已连接，但连接角色无权访问 research_checkpoints schema。";
  if (codes.includes("3D000"))
    return "DATABASE_URL 指向的数据库不存在，请确认连接串末尾为 /postgres。";
  if (
    codes.some((code) =>
      ["ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "ETIMEDOUT"].includes(code),
    )
  )
    return "DATABASE_URL 无法连接。Vercel 请使用 Supabase Shared Pooler 地址，不要使用仅支持 IPv6 的直连地址。";
  return "LangGraph 持久化连接失败，请检查 DATABASE_URL 是否为 Supabase Session pooler（5432）连接串。";
}

export async function checkpointer(runId: string) {
  if (process.env.DATABASE_URL) {
    const saver = PostgresSaver.fromConnString(process.env.DATABASE_URL, {
      schema: "research_checkpoints",
    });
    try {
      await saver.setup();
    } catch (error) {
      await saver.end();
      throw new Error(checkpointError(error));
    }
    return { saver, close: () => saver.end() };
  }
  if (process.env.VERCEL || process.env.SUPABASE_URL)
    throw new Error("云端研究需要配置 DATABASE_URL，以保存 LangGraph 检查点。");
  const saver = new FileSaver(
    path.join(process.cwd(), ".data", "checkpoints", `${runId}.bin`),
  );
  await saver.load();
  return { saver, close: async () => {} };
}
