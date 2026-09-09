import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { mutateDatabase, readDatabase, dashboard } from "../src/server/store";
import { encrypt, decrypt } from "../src/server/security";
import { startRun, executeRun } from "../src/server/research";
import { synthesisInstruction } from "../src/server/synthesis";

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
    const collectedCalls = calls;
    assert.ok(collectedCalls >= 1);
    const resumed = await startRun("incremental", false, created.id);
    await executeRun(resumed.id, true, {
      ...deps,
      complete: async () => ({
        items: [
          {
            title: "工业智能体研究完成",
            summary: "来自真实测试夹具的可验证产品披露。",
            implication: "分析判断：关注产业应用。",
            category: "解决方案",
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
    assert.equal(calls, collectedCalls, "completed collection must not rerun after restore");
    assert.equal(state.items.length, 1);
    assert.equal(
      state.runs[0].status,
      "completed",
      "successful publication is complete even when non-fatal warnings are logged",
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

test("research synthesizes the merged corpus and publishes traceable insight atomically", async () => {
  const original = process.cwd();
  const temp = await mkdtemp(path.join(os.tmpdir(), "chicheng-synthesis-"));
  process.chdir(temp);
  const quote = "企业正式披露工业设备预测性维护新方案的产品能力";
  let corpusCount = 0;
  try {
    const encrypted = await encrypt("test-not-a-real-api-key");
    await mutateDatabase((db) => {
      db.settings.companies = [];
      db.settings.sources = [{ id: "fixture", name: "fixture", url: "https://example.com/new", kind: "website", enabled: true }];
      db.credentials.deepseek = encrypted;
      db.items = [{ id: "history", eventKey: "history", title: "另一企业披露工业设计软件能力", summary: "另一企业公布了工业设计软件的新功能与交付路径。", implication: "研究分析", category: "产品发布", topic: "工业智能", importance: "high", company: "历史公司", confidence: .9, publishedAt: new Date().toISOString(), observedAt: new Date().toISOString(), runId: "history", evidence: [{ url: "https://example.com/history", title: "原文", quote: "另一企业披露的设计软件功能原文证据" }] }];
    });
    const run = await startRun("incremental");
    await executeRun(run.id, false, {
      collectSource: async () => [{ url: "https://example.com/new", title: "设备维护", text: quote.repeat(10), publishedAt: new Date().toISOString(), source: "fixture" }],
      discover: async () => ({ candidates: [], queryCount: 0, resultCount: 0, deduplicatedCount: 0, failedQueries: 0 }),
      complete: async (_provider, _model, _key, system, prompt) => {
        if (system === synthesisInstruction) {
          const events = JSON.parse(prompt).events as { id: string }[];
          corpusCount = events.length;
          return { overview: "当前两条独立事件提示，工业软件的功能开发与现场应用能力需要共同考察。", conclusions: [{
            concept: "功能开发与现场应用互为补充", judgment: "当前材料显示不同企业分别关注设计能力与设备维护，值得结合客户工作流进行比较。",
            reasoning: "历史设计软件披露与本次设备维护发布覆盖工业流程的不同环节，构成两类互补的研究线索。",
            implication: "炽橙可从目标客户的业务流程验证两类能力的集成需求。", watchpoint: "样本不足以判断市场普遍需求，后续需要继续观察客户交付情况。", evidenceIds: events.map((event) => event.id),
          }] };
        }
        return { items: [{ title: "新公司发布设备预测性维护方案", summary: "新公司正式公布工业设备预测性维护的产品与应用能力。", implication: "研究判断", category: "解决方案", topic: "智能运维", importance: "high", company: "新公司", eventKey: "maintenance", confidence: .9, evidence: [{ document: 0, quote }] }], profiles: [] };
      },
    });
    const result = await dashboard();
    assert.equal(result.runs[0].status, "completed");
    assert.equal(corpusCount, 2, "synthesis must include historical and incoming events");
    assert.equal(result.insights?.conclusions.length, 1);
    assert.equal(result.insights?.runId, run.id);
    await mutateDatabase((db) => { db.items = db.items.slice(0, 1); });
    assert.equal((await dashboard()).insights, undefined);
  } finally { process.chdir(original); }
});
