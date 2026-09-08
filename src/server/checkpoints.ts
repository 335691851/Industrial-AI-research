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
export async function checkpointer(runId: string) {
  if (process.env.DATABASE_URL) {
    const saver = PostgresSaver.fromConnString(process.env.DATABASE_URL, {
      schema: "research_checkpoints",
    });
    try {
      await saver.setup();
    } catch {
      await saver.end();
      throw new Error(
        "LangGraph 持久化连接失败，请检查 DATABASE_URL 与私有 schema 权限。",
      );
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
