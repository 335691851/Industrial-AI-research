import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { mutateDatabase, readDatabase, dashboard } from "../src/server/store";
import { encrypt, decrypt } from "../src/server/security";
import { startRun, executeRun } from "../src/server/research";

test("real LangGraph pipeline checkpoints, resumes after model failure and publishes once", async () => {
  // Test subprocess has its own cwd; no user workspace data or live provider calls.
  const original = process.cwd();
  const temp = await mkdtemp(path.join(os.tmpdir(), "chicheng-harness-"));
  process.chdir(temp);
  const quote = "测试公司正式发布工业智能体平台与智能运维产品";
  let calls = 0;
  try {
    const encrypted = await encrypt("test-not-a-real-api-key");
    assert.equal(await decrypt(encrypted), "test-not-a-real-api-key");
    await mutateDatabase((db) => {
      db.items = [];
      db.profiles = [];
      db.settings.sources = [
        {
          id: "test",
          name: "fixture",
          url: "https://example.com",
          kind: "website",
          enabled: true,
        },
      ];
      db.credentials.deepseek = encrypted;
    });
    const created = await startRun("incremental");
    await assert.rejects(startRun("full"), /运行中/);
    const deps = {
      collectSource: async () => {
        calls++;
        return [
          {
            url: "https://example.com/a",
            title: "工业智能研究",
            text: quote.repeat(10),
            publishedAt: new Date().toISOString(),
            source: "fixture",
          },
        ];
      },
      discover: async () => ({
        candidates: [],
        queryCount: 0,
        resultCount: 0,
        deduplicatedCount: 0,
        failedQueries: 0,
      }),
      complete: async () => {
        throw new Error("测试模型暂不可用。");
      },
    };
    await executeRun(created.id, false, deps);
    assert.equal((await readDatabase()).runs[0].status, "failed");
    assert.equal(calls, 1);
    const resumed = await startRun("incremental", false, created.id);
    await executeRun(resumed.id, true, {
      ...deps,
      complete: async () => ({
        items: [
          {
            title: "工业智能体研究完成",
            summary: "来自真实测试夹具的可验证产品披露。",
            implication: "分析判断：关注产业应用。",
            category: "产品方案",
            topic: "工业智能",
            importance: "high",
            company: "测试公司",
            eventKey: "fixture-product",
            confidence: 0.9,
            evidence: [{ document: 0, quote }],
          },
        ],
        profiles: [],
      }),
    });
    const state = await readDatabase();
    assert.equal(calls, 1, "completed collection must not rerun after restore");
    assert.equal(state.items.length, 1);
    assert.equal(
      state.runs[0].status,
      "partial",
      "a run recovered with deterministic planning remains transparently partial",
    );
    assert.ok(state.runs[0].events.some((e) => e.node === "融合发布"));
    const safe = JSON.stringify(await dashboard());
    assert.equal(safe.includes("test-not-a-real-api-key"), false);
    assert.equal(safe.includes(encrypted), false);
    const stored = await readFile(
      path.join(temp, ".data/workspace.json"),
      "utf8",
    );
    assert.equal(stored.includes("test-not-a-real-api-key"), false);
    await mutateDatabase((current) => {
      current.runs[0].status = "running";
      current.runs[0].startedAt = new Date(Date.now() - 400000).toISOString();
    });
    assert.equal(
      (await dashboard()).runs[0].status,
      "failed",
      "dashboard must expose recovery after a killed worker",
    );
  } finally {
    process.chdir(original);
  }
});
