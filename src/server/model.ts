import { ProviderId, providers } from "@/lib/domain";

export class ModelOutputTruncatedError extends Error {
  constructor() {
    super("模型输出达到长度上限，系统将自动缩小当前批次重试。");
    this.name = "ModelOutputTruncatedError";
  }
}

export type CompletionOptions = {
  /** Keep each task within the output budget it actually needs. */
  maxTokens?: number;
};

export async function complete(
  provider: ProviderId,
  model: string,
  key: string,
  system: string,
  prompt: string,
  signal: AbortSignal,
  options: CompletionOptions = {},
) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch(
      `${providers[provider].baseUrl}/chat/completions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: prompt },
          ],
          temperature: 0.2,
          max_tokens: options.maxTokens ?? 6500,
          response_format: { type: "json_object" },
          ...(provider === "qwen" ? { enable_thinking: false } : {}),
          ...(provider === "deepseek" || provider === "glm"
            ? { thinking: { type: "disabled" } }
            : {}),
        }),
        signal: AbortSignal.any([signal, AbortSignal.timeout(45000)]),
      },
    );
    if ((response.status === 429 || response.status >= 500) && attempt === 0) {
      await response.body?.cancel();
      await new Promise((r) => setTimeout(r, 1200));
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(
        `模型请求失败（HTTP ${response.status}），请检查密钥、模型名称、余额或服务状态。`,
      );
    }
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (data.choices?.[0]?.finish_reason === "length")
      throw new ModelOutputTruncatedError();
    if (typeof content !== "string")
      throw new Error("模型未返回有效内容，任务已保留可恢复进度。");
    try {
      return JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/g, ""));
    } catch {
      throw new Error("模型未返回有效 JSON，任务已保留可恢复进度。");
    }
  }
  throw new Error("模型服务暂不可用。");
}
