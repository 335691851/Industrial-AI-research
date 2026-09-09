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
      [
        "ENOTFOUND",
        "EAI_AGAIN",
        "ECONNREFUSED",
        "ECONNRESET",
        "ENETUNREACH",
        "ETIMEDOUT",
      ].includes(code),
    )
  )
    return "DATABASE_URL 无法连接。Vercel 请使用 Supabase Shared Pooler 地址，不要使用仅支持 IPv6 的直连地址。";
  if (
    codes.some((code) =>
      [
        "DEPTH_ZERO_SELF_SIGNED_CERT",
        "SELF_SIGNED_CERT_IN_CHAIN",
        "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
        "ERR_TLS_CERT_ALTNAME_INVALID",
      ].includes(code),
    )
  )
    return "DATABASE_URL 的 TLS 证书校验失败。请为 verify-full 安装 Supabase CA，或在 Vercel 明确使用 uselibpqcompat=true&sslmode=require。";
  const safeCode = codes.find((code) => /^[A-Z0-9_]{2,32}$/i.test(code));
  return `LangGraph 持久化连接失败${safeCode ? `（错误代码：${safeCode}）` : ""}，请检查 DATABASE_URL 是否为 Supabase Session pooler（5432）连接串。`;
}

export function checkpointConnection(value: string) {
  try {
    const url = new URL(value);
    // pg currently treats `require` as verify-full and emits a runtime warning.
    // Make the intended, stronger behavior explicit without changing the secret.
    const libpqCompat = url.searchParams.get("uselibpqcompat") === "true";
    if (url.searchParams.get("sslmode") === "require" && !libpqCompat)
      url.searchParams.set("sslmode", "verify-full");
    return {
      connectionString: url.toString(),
      target: {
        host: url.hostname,
        port: url.port || "5432",
        database: url.pathname.replace(/^\//, "") || "postgres",
        sslmode: url.searchParams.get("sslmode") || "unset",
        certificateVerification: libpqCompat ? "libpq-require" : "full",
      },
    };
  } catch {
    return {
      connectionString: value,
      target: {
        host: "invalid-url",
        port: "unset",
        database: "unset",
        sslmode: "unset",
        certificateVerification: "unset",
      },
    };
  }
}

export async function checkpointer(runId: string) {
  if (process.env.DATABASE_URL) {
    const connection = checkpointConnection(process.env.DATABASE_URL);
    const saver = PostgresSaver.fromConnString(connection.connectionString, {
      schema: "research_checkpoints",
    });
    try {
      await saver.setup();
    } catch (error) {
      const diagnostic = checkpointError(error);
      console.error("LangGraph checkpoint setup failed", {
        target: connection.target,
        diagnostic,
      });
      await saver.end();
      throw new Error(diagnostic);
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

