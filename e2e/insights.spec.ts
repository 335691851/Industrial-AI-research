import { test, expect } from "@playwright/test";

test("insights stay within half a screen and preserve expandable details", async ({ page }) => {
  // Browser-only response fixture: never save fabricated reports to the workspace.
  await page.route("**/api/workspace", async (route) => {
    const response = await route.fetch();
    const workspace = await response.json();
    await route.fulfill({ json: { ...workspace, insights: {
      overview: "工业智能的竞争正在从单点技术延伸到系统交付与场景验证。".repeat(15),
      generatedAt: new Date().toISOString(), runId: "layout-check", basis: "layout-check",
      conclusions: Array.from({ length: 6 }, (_, index) => ({
        concept: `产业观察结论 ${index + 1}`,
        judgment: "需要结合客户场景评估技术能力。",
        reasoning: "完整推理内容保留。", implication: "检验交付能力。",
        watchpoint: "追踪后续验证结果。", evidenceIds: [],
      })),
    } } });
  });
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    const panel = page.getByRole("region", { name: "综合洞察", exact: true });
    const toggle = panel.getByRole("button", { name: "展开完整洞察 · 6 项结论" });
    await expect(toggle).toBeVisible();
    const bounds = await panel.boundingBox();
    expect(bounds!.height).toBeLessThanOrEqual(viewport.height / 2 + 1);
    const buttonBounds = await toggle.boundingBox();
    expect(buttonBounds!.y + buttonBounds!.height).toBeLessThanOrEqual(bounds!.y + bounds!.height);
    await expect(panel.locator(".synthesis-conclusion")).toHaveCount(0);
    await toggle.click();
    await expect(panel.locator(".synthesis-conclusion")).toHaveCount(6);
    await expect(panel.getByText("完整推理内容保留。").first()).toBeVisible();
    await panel.getByRole("button", { name: "收起详细洞察" }).click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect((await panel.boundingBox())!.height).toBeLessThanOrEqual(viewport.height / 2 + 1);
  }
});
