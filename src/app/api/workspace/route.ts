import { dashboard, mutateDatabase } from "@/server/store";
import { canEdit, encrypt, publicError, requireWrite } from "@/server/security";
import { settingsSchema, providerIds } from "@/lib/domain";
import { validateUrl } from "@/server/collector";
import { z } from "zod";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    return Response.json(await dashboard(canEdit(request)), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return Response.json({ error: publicError(e) }, { status: 503 });
  }
}
export async function PUT(request: Request) {
  try {
    requireWrite(request);
    const text = await request.text();
    if (text.length > 65000) throw new Error("配置内容过大。");
    const body = z
      .object({
        settings: settingsSchema,
        keys: z
          .partialRecord(z.enum(providerIds), z.string().max(500))
          .optional(),
        removeKeys: z.array(z.enum(providerIds)).optional(),
      })
      .parse(JSON.parse(text));
    for (const source of body.settings.sources) {
      const url = validateUrl(source.url);
      if (source.kind === "wechat" && url.hostname !== "mp.weixin.qq.com")
        throw new Error(
          "微信公众号来源请使用 mp.weixin.qq.com 的文章链接或公开主页链接。",
        );
    }
    const encrypted = Object.fromEntries(
      await Promise.all(
        Object.entries(body.keys ?? {})
          .filter(([, v]) => v.trim())
          .map(async ([k, v]) => [k, await encrypt(v.trim())]),
      ),
    );
    await mutateDatabase((db) => {
      if (db.settings.revision !== body.settings.revision)
        throw new Error("配置已被其他窗口更新，请刷新后重新修改。");
      db.settings = { ...body.settings, revision: db.settings.revision + 1 };
      Object.assign(db.credentials, encrypted);
      for (const p of body.removeKeys ?? []) delete db.credentials[p];
    });
    return Response.json(await dashboard(canEdit(request)));
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof z.ZodError
            ? "配置格式不正确，请检查名称、网址与模型字段。"
            : publicError(e),
      },
      { status: 400 },
    );
  }
}
