"use client";
import { useEffect, useState } from "react";
import {
  Bot,
  Check,
  ChevronDown,
  Clock3,
  KeyRound,
  RefreshCw,
  Save,
  ShieldCheck,
  Workflow,
  XCircle,
} from "lucide-react";
import {
  Dashboard,
  Settings,
  ProviderId,
  providerIds,
  providers,
  Run,
} from "@/lib/domain";

export function AgentPanel({
  data,
  save,
  run,
  busy,
}: {
  data: Dashboard;
  save: (
    settings: Settings,
    keys?: Record<string, string>,
    removeKeys?: string[],
  ) => Promise<void>;
  run: (mode: "incremental" | "full", resumeId?: string) => Promise<void>;
  busy: boolean;
}) {
  const [form, setForm] = useState(structuredClone(data.settings));
  const [dirty, setDirty] = useState(false);
  const [keys, setKeys] = useState<Partial<Record<ProviderId, string>>>({});
  const [removed, setRemoved] = useState<ProviderId[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<string | null>(
    data.runs[0]?.id ?? null,
  );
  useEffect(() => {
    if (!dirty) setForm(structuredClone(data.settings));
  }, [data.settings, dirty]);
  async function submit() {
    setSaving(true);
    setError("");
    try {
      await save(form, keys, removed);
      setKeys({});
      setRemoved([]);
      setDirty(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  function update(partial: Partial<Settings>) {
    setForm((f) => ({ ...f, ...partial }));
    setDirty(true);
  }
  return (
    <>
      <div className="agent-overview">
        <section className="panel schedule-card">
          <span className="schedule-icon">
            <Clock3 size={24} />
          </span>
          <div>
            <span className="eyebrow">DAILY RESEARCH</span>
            <h2>
              每天 <strong>19:00</strong> 自动开展研究
            </h2>
            <p>北京时间 · 增量采集、结构化分析与内容融合</p>
          </div>
          <span className="schedule-badge">
            {data.storage === "local" ? "部署后启用" : "生产部署生效"}
          </span>
        </section>
        <section className="panel engine-card">
          <Workflow size={23} className="text-purple" />
          <div>
            <h3>LangGraph Harness</h3>
            <p>持久化检查点 · 证据校验 · 失败恢复</p>
          </div>
        </section>
      </div>
      <section className="panel harness-panel">
        <div className="panel-heading">
          <h2>
            <Bot size={18} />
            研究工作流
          </h2>
          <span className="subtle">端到端可追溯</span>
        </div>
        <div className="pipeline">
          {["自主规划", "来源采集", "覆盖检查", "补充搜索", "结构化分析", "证据校验", "融合发布"].map(
            (s, i) => (
              <div key={s}>
                <span>0{i + 1}</span>
                <strong>{s}</strong>
                {i < 6 && <span className="pipeline-arrow">→</span>}
              </div>
            ),
          )}
        </div>
      </section>
      <div className="section-heading">
        <h2>
          <KeyRound size={18} />
          模型与 API 配置
        </h2>
        <span className="subtle">
          <ShieldCheck size={14} />
          密钥加密保存，不回显
        </span>
      </div>
      <fieldset disabled={!data.editable || saving} className="config-fieldset">
        <div className="provider-grid">
          {providerIds.map((id) => {
            const p = providers[id];
            const configured = data.configured[id] && !removed.includes(id);
            return (
              <section
                className={`panel provider-card ${form.selectedProvider === id ? "provider-selected" : ""}`}
                key={id}
              >
                <div className="provider-heading">
                  <span
                    className="provider-logo"
                    style={{ color: p.color, background: `${p.color}15` }}
                  >
                    {p.name.slice(0, 1)}
                  </span>
                  <h3>{p.name}</h3>
                  <button
                    className={`radio ${form.selectedProvider === id ? "checked" : ""}`}
                    role="radio"
                    aria-checked={form.selectedProvider === id}
                    aria-label={`选择 ${p.name}`}
                    onClick={() => update({ selectedProvider: id })}
                  >
                    {form.selectedProvider === id && <Check size={13} />}
                  </button>
                </div>
                <span
                  className={`credential-status ${configured ? "configured" : ""}`}
                >
                  <i />
                  {configured ? "已保存密钥" : "待配置密钥"}
                </span>
                <label>
                  模型名称
                  <select
                    value={form.models[id]}
                    onChange={(e) =>
                      update({
                        models: { ...form.models, [id]: e.target.value },
                      })
                    }
                    aria-label={`${p.name} 模型名称`}
                  >
                    {p.models.map((model) => (
                      <option value={model.id} key={model.id}>
                        {model.label} · {model.id}
                      </option>
                    ))}
                  </select>
                  <small className="model-hint">仅允许已校验的兼容模型标识</small>
                </label>
                <label>
                  API Key
                  <input
                    type="password"
                    autoComplete="new-password"
                    spellCheck={false}
                    aria-label={`${p.name} API Key`}
                    placeholder={
                      configured ? "已加密保存 · 留空保留" : "输入 API Key"
                    }
                    value={keys[id] ?? ""}
                    onChange={(e) => {
                      setKeys((k) => ({ ...k, [id]: e.target.value }));
                      setRemoved((v) => v.filter((p) => p !== id));
                      setDirty(true);
                    }}
                  />
                </label>
                <div className="provider-bottom">
                  <span>
                    {form.selectedProvider === id ? "当前选择" : "可切换使用"}
                  </span>
                  {configured && (
                    <button
                      onClick={() => {
                        setRemoved((v) => [...v, id]);
                        setKeys((v) => ({ ...v, [id]: "" }));
                        setDirty(true);
                      }}
                    >
                      移除密钥
                    </button>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </fieldset>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="save-bar">
        <span>
          {dirty
            ? "修改尚未保存"
            : `已选择 ${providers[data.settings.selectedProvider].name} · ${data.settings.models[data.settings.selectedProvider]}`}
        </span>
        <button
          className="button primary"
          disabled={saving || !dirty || !data.editable}
          onClick={submit}
        >
          <Save size={15} />
          {saving ? "保存中…" : "保存模型选择与密钥"}
        </button>
      </div>
      <div className="section-heading run-heading">
        <h2>
          智能体运行记录<span className="small-label">EXECUTION HISTORY</span>
        </h2>
        <div className="heading-actions">
          <button
            className="button secondary"
            disabled={busy || !data.editable}
            onClick={() => void run("full")}
          >
            <RefreshCw size={15} />
            全量重研
          </button>
        </div>
      </div>
      <section className="panel run-list">
        {data.runs.length ? (
          data.runs.map((r) => (
            <div className="run-entry" key={r.id}>
              <button
                className="run-summary"
                onClick={() => setExpanded(expanded === r.id ? null : r.id)}
              >
                <span className={`run-status-icon ${r.status}`}>
                  {r.status === "failed" ? (
                    <XCircle size={18} />
                  ) : r.status === "running" ? (
                    <RefreshCw size={18} className="spin" />
                  ) : (
                    <Check size={18} />
                  )}
                </span>
                <div>
                  <strong>
                    {r.mode === "full" ? "全量行业研究" : "每日增量研究"}
                  </strong>
                  <small>
                    {new Date(r.startedAt).toLocaleString("zh-CN", {
                      timeZone: "Asia/Shanghai",
                    })}{" "}
                    · {r.model}
                  </small>
                </div>
                <span className={`run-status ${r.status}`}>
                  {statusLabel(r)}
                </span>
                <span className="run-count">{r.itemCount} 条情报</span>
                <ChevronDown
                  size={16}
                  style={{
                    transform: expanded === r.id ? "rotate(180deg)" : undefined,
                  }}
                />
              </button>
              {expanded === r.id && (
                <div className="run-detail">
                  <div className="run-id">RUN / {r.id}</div>
                  {r.sourceStats && (
                    <div className="run-source-stats">
                      <span>搜索范围 <strong>{r.sourceStats.queryCount}</strong> 个问题</span>
                      <span>搜索结果 <strong>{r.sourceStats.searchResults}</strong> 条</span>
                      <span>去重后 <strong>{r.sourceStats.deduplicated}</strong> 条</span>
                      <span>读取正文 <strong>{r.sourceStats.read}</strong> 份</span>
                      <span>有效内容 <strong>{r.sourceStats.effective}</strong> 份</span>
                      <span>进入分析 <strong>{r.sourceStats.analyzed}</strong> 份</span>
                    </div>
                  )}
                  {r.events.map((event, i) => (
                    <div className={`log-line ${event.status}`} key={i}>
                      <span className="log-dot" />
                      <time>
                        {new Date(event.at).toLocaleTimeString("zh-CN", {
                          timeZone: "Asia/Shanghai",
                          hour12: false,
                        })}
                      </time>
                      <strong>{event.node}</strong>
                      <p>{event.message}</p>
                    </div>
                  ))}
                  {!r.events.length && (
                    <p className="muted">任务已创建，正在初始化研究服务…</p>
                  )}
                  {r.error && <p className="form-error">{r.error}</p>}
                  {r.status === "failed" && (
                    <button
                      className="button secondary"
                      disabled={busy || !data.editable}
                      onClick={() => void run(r.mode, r.id)}
                    >
                      <RefreshCw size={14} />
                      从检查点恢复
                    </button>
                  )}
                </div>
              )}
            </div>
          ))
        ) : (
          <div className="empty-state">
            <Bot size={30} />
            <h3>第一份洞察，从一次研究开始</h3>
            <p>保存模型密钥后发起研究，过程与结果将在这里记录。</p>
            <small>
              手动全量重研覆盖最近 30 天；每日增量研究由系统在 19:00 自动执行，并滚动剔除第 31 天以前的数据。
            </small>
          </div>
        )}
      </section>
    </>
  );
}
function statusLabel(run: Run) {
  return {
    running: "运行中",
    completed: "已完成",
    partial: "部分完成",
    failed: "执行失败",
  }[run.status];
}
