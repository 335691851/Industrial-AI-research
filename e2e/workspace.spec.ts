import { test, expect } from "@playwright/test";
test("research UI: search, evidence dialog, configuration roundtrip, model selection and mobile", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "全球工业智能情报." }),
  ).toBeVisible();
  await expect(page.getByLabel("搜索情报")).toBeVisible();
  await page.screenshot({
    path: "artifacts/dashboard-desktop.png",
    fullPage: true,
  });
  await page.getByLabel("搜索情报").fill("不存在的检索词abcdef");
  await expect(page.getByText("没有匹配的情报")).toBeVisible();
  await page.getByRole("button", { name: "重置筛选" }).click();
  await page.locator(".highlight-card").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /来源与原文证据/ }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const initial = await (await request.get("/api/workspace")).json();
  await page.getByRole("button", { name: "来源配置 Sources" }).click();
  await page.getByLabel("新增研究关键词").fill("浏览器测试关键词");
  await page.getByRole("button", { name: "添加关键词", exact: true }).click();
  await page.getByRole("button", { name: "保存来源配置" }).click();
  await expect(page.getByRole("status")).toContainText("配置已保存");
  await page.reload();
  await page.getByRole("button", { name: "来源配置 Sources" }).click();
  await expect(
    page.getByText("浏览器测试关键词", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("删除关键词 浏览器测试关键词").click();
  await page.getByRole("button", { name: "保存来源配置" }).click();
  await expect(
    page.getByRole("button", { name: "保存来源配置" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "智能体记录 Agents" }).click();
  await page.getByRole("radio", { name: "选择 Qwen · 通义千问" }).click();
  await page.getByRole("button", { name: "保存模型选择与密钥" }).click();
  await expect(
    page.getByRole("button", { name: "保存模型选择与密钥" }),
  ).toBeDisabled();
  const updated = await (await request.get("/api/workspace")).json();
  expect(updated.settings.selectedProvider).toBe("qwen");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "artifacts/agents-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await request.put("/api/workspace", {
    data: {
      settings: { ...initial.settings, revision: updated.settings.revision },
    },
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByLabel("搜索情报")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "打开导航" }).click();
  await page.getByRole("button", { name: "来源配置 Sources" }).click();
  await expect(page.getByLabel("新增研究关键词")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await expect
    .poll(() =>
      page.locator(".sidebar").evaluate((e) => e.getBoundingClientRect().right),
    )
    .toBeLessThanOrEqual(0);
  await page.screenshot({
    path: "artifacts/sources-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  expect(errors).toEqual([]);
});
test("API blocks unsafe source URLs, cross-site writes and unauthenticated cron", async ({
  request,
}) => {
  expect((await request.get("/api/cron")).status()).toBe(401);
  const { settings } = await (await request.get("/api/workspace")).json();
  const blocked = await request.put("/api/workspace", {
    data: {
      settings: {
        ...settings,
        sources: [
          {
            id: "ssrf",
            name: "internal",
            kind: "website",
            url: "http://127.0.0.1/",
            enabled: true,
          },
        ],
      },
    },
  });
  expect(blocked.status()).toBe(400);
  const crossSite = await request.put("/api/workspace", {
    headers: { origin: "https://untrusted.example" },
    data: { settings },
  });
  expect(crossSite.status()).toBe(400);
});
