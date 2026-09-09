import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

export function equalSecret(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export function workspaceAccess(request: Request) {
  const configuredToken = process.env.WORKSPACE_ACCESS_TOKEN?.trim() ?? "";
  return {
    configured: Boolean(configuredToken),
    editable: Boolean(
      configuredToken &&
        equalSecret(
          request.headers.get("x-workspace-token")?.trim() ?? "",
          configuredToken,
        ),
    ),
  };
}
export function canEdit(request: Request) {
  const access = workspaceAccess(request);
  if (access.configured) return access.editable;
  if (process.env.VERCEL) return false;
  const host = new URL(request.url).hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}
export function requireWrite(request: Request) {
  if (!canEdit(request))
    throw new Error("当前为只读访问。请通过企业可信入口进行配置或运行任务。");
  const origin = request.headers.get("origin");
  // Next.js may reconstruct request.url with an internal hostname behind a proxy.
  // Browser Origin must match the external Host, not that internal URL hostname.
  const requestUrl = new URL(request.url);
  const host = request.headers.get("host") ?? requestUrl.host;
  if (
    origin &&
    (new URL(origin).host !== host ||
      !["http:", "https:"].includes(new URL(origin).protocol))
  )
    throw new Error("不接受跨站写入请求。");
  if (request.headers.get("sec-fetch-site") === "cross-site")
    throw new Error("不接受跨站写入请求。");
}
async function encryptionKey() {
  const key = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (key) {
    if (!/^[0-9a-f]{64}$/i.test(key))
      throw new Error("加密主密钥必须为 64 位十六进制字符串。");
    return Buffer.from(key, "hex");
  }
  if (process.env.VERCEL || process.env.SUPABASE_URL)
    throw new Error("请先配置服务端 CREDENTIAL_ENCRYPTION_KEY。");
  const dir = path.join(process.cwd(), ".data");
  const file = path.join(dir, "encryption.key");
  await mkdir(dir, { recursive: true });
  try {
    await writeFile(file, randomBytes(32), { flag: "wx", mode: 0o600 });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
  }
  return readFile(file);
}
export async function encrypt(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", await encryptionKey(), iv);
  const bytes = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), bytes]
    .map((b) => b.toString("base64"))
    .join(".");
}
export async function decrypt(value: string) {
  const [iv, tag, bytes] = value
    .split(".")
    .map((s) => Buffer.from(s, "base64"));
  const cipher = createDecipheriv("aes-256-gcm", await encryptionKey(), iv);
  cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(bytes), cipher.final()]).toString("utf8");
}
export function publicError(error: unknown) {
  // Expose only allowlisted diagnostics, never raw provider errors or credentials.
  const codes: string[] = [];
  let current: unknown = error;
  for (let depth = 0; current && typeof current === "object" && depth < 5; depth++) {
    const detail = current as { code?: unknown; name?: unknown; cause?: unknown };
    if (typeof detail.code === "string") codes.push(detail.code);
    if (typeof detail.name === "string") codes.push(detail.name);
    current = detail.cause;
  }
  if (codes.some(code => ["EACCES", "EPERM"].includes(code)))
    return "服务进程的网络访问被系统权限限制，请在允许联网的终端重新启动服务（EACCES / EPERM）。";
  if (codes.some(code => ["ENOTFOUND", "EAI_AGAIN"].includes(code)))
    return "来源域名解析失败，请检查 DNS 或网络连接。";
  if (codes.some(code => ["ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT", "TimeoutError"].includes(code)))
    return "来源或模型服务连接超时，请检查网络后重试。";
  if (codes.some(code => ["ECONNRESET", "ECONNREFUSED", "ENETUNREACH", "EHOSTUNREACH"].includes(code)))
    return "远端连接被拒绝、中断或不可达，请检查网络与目标服务。";
  if (
    error instanceof Error &&
    /[\u4e00-\u9fff]/.test(error.message) &&
    !/sk-|Bearer|postgres|supabase\.co/i.test(error.message)
  )
    return error.message.slice(0, 250);
  return "操作未完成，请检查服务配置或稍后重试。敏感错误内容已隐藏。";
}
