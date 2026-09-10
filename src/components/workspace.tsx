"use client";
import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  ArrowDown,
  ArrowUpRight,
  Bot,
  Boxes,
  Check,
  ChevronRight,
  Clock3,
  Database,
  ExternalLink,
  Flame,
  Globe2,
  KeyRound,
  LayoutDashboard,
  Loader2,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Radio,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Zap,
} from "lucide-react";
import {
  Dashboard,
  Item,
  Profile,
  Settings,
  topics,
  categories,
  prioritySignals,
  effectiveDate,
  validDate,
} from "@/lib/domain";
import { SourceSettings } from "./source-settings";
import { AgentPanel } from "./agent-panel";
import { ResearchInsights } from "./charts";
import { PriorityCarousel } from "./priority-carousel";
import { Detail } from "./detail";

type View = "intelligence" | "sources" | "agents";

async function readApiResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json"))
    throw new Error(
      "当前部署的 API 被 Vercel 访问保护拦截，请使用最新生产域名或调整 Deployment Protection。",
    );
  return response.json() as Promise<T>;
}

export function Workspace() {
  const [view, setView] = useState<View>("intelligence");
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [running, setRunning] = useState(false);
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState("全部领域");
  const [category, setCategory] = useState("全部情报");
  const [detail, setDetail] = useState<Item | Profile | null>(null);
  const [mobile, setMobile] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sort, setSort] = useState("importance");
  const [accessToken, setAccessToken] = useState("");
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [tokenInput, setTokenInput] = useState("");
  const [unlockError, setUnlockError] = useState("");
  const load = useCallback(async (silent = false, token = accessToken) => {
    if (!silent) setRefreshing(true);
    try {
      const r = await fetch("/api/workspace", {
        cache: "no-store",
        headers: token ? { "x-workspace-token": token } : {},
      });
      const body = await readApiResponse<Dashboard & { error?: string }>(r);
      if (!r.ok) throw new Error(body.error);
      setData(body);
      setError("");
    } catch (e) {
      setError((e as Error).message || "连接失败，请重试。");
    } finally {
      setRefreshing(false);
    }
  }, [accessToken]);
  useEffect(() => {
    setAccessToken(sessionStorage.getItem("workspace-access-token") ?? "");
    setSidebarCollapsed(localStorage.getItem("sidebar-collapsed") === "true");
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const active = data?.runs.some((r) => r.status === "running");
  useEffect(() => {
    const timer = setInterval(
      () => {
        if (document.visibilityState === "visible") void load(true);
      },
      active ? 3000 : 60000,
    );
    return () => clearInterval(timer);
  }, [active, load]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
  async function save(
    settings: Settings,
    keys?: Record<string, string>,
    removeKeys?: string[],
  ) {
    const response = await fetch("/api/workspace", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { "x-workspace-token": accessToken } : {}),
      },
      body: JSON.stringify({ settings, keys, removeKeys }),
    });
    const body = await readApiResponse<Dashboard & { error?: string }>(response);
    if (!response.ok) throw new Error(body.error);
    setData(body);
    setNotice("配置已保存，下一次研究将使用此配置。");
  }
  async function run(mode: "incremental" | "full", resumeId?: string) {
    setRunning(true);
    try {
      const r = await fetch("/api/runs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { "x-workspace-token": accessToken } : {}),
        },
        body: JSON.stringify({ mode, resumeId }),
      });
      const body = await readApiResponse<{ error?: string }>(r);
      if (!r.ok) throw new Error(body.error);
      setNotice("研究任务已启动，可在智能体记录中查看进度。");
      await load(true);
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setRunning(false);
    }
  }
  function navigate(next: View) {
    setView(next);
    setMobile(false);
  }
  async function unlock() {
    const token = tokenInput.trim();
    if (!token) return;
    setUnlockError("");
    setRefreshing(true);
    try {
      const response = await fetch("/api/access", {
        method: "POST",
        cache: "no-store",
        headers: { "x-workspace-token": token },
      });
      const body = await readApiResponse<{
        editable: boolean;
        configured: boolean;
        error?: string;
      }>(response);
      if (!response.ok || !body.editable)
        throw new Error(body.error || "管理口令校验失败，请重试。");
      sessionStorage.setItem("workspace-access-token", token);
      setAccessToken(token);
      setTokenInput("");
      setUnlockOpen(false);
      await load(true, token);
      setError("");
      setNotice("管理权限已解锁，本次浏览器会话内有效。");
    } catch (e) {
      setUnlockError((e as Error).message || "管理口令校验失败，请重试。");
    } finally {
      setRefreshing(false);
    }
  }
  const items = data?.items ?? [];
  const filtered = items
    .filter(
      (i) =>
        (topic === "全部领域" || i.topic === topic) &&
        (category === "全部情报" || i.category === category) &&
        `${i.title} ${i.summary} ${i.company}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "importance"
        ? { critical: 0, high: 1, normal: 2 }[a.importance] -
          { critical: 0, high: 1, normal: 2 }[b.importance]
        : Date.parse(effectiveDate(b)) - Date.parse(effectiveDate(a)),
    );
  const highlights = prioritySignals(items);
  const visibleCategories = categories.filter((value) =>
    items.some((item) => item.category === value),
  );
  return (
    <div className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <aside className={`sidebar ${mobile ? "mobile-open" : ""}`}>
        <a className="brand" href="/" aria-label="全球工业智能导航首页">
          <span className="brand-mark">
            <svg viewBox="0 0 44 44" role="img" aria-label="工业智能导航标志">
              <path d="M22 4 37.6 13v18L22 40 6.4 31V13Z" />
              <path d="m13 25 9-13 9 13-9 7Z" />
              <circle cx="22" cy="22" r="3.2" />
              <path d="M6.4 13 22 22l15.6-9M22 40V22" />
            </svg>
          </span>
          <span>
            <strong>
              全球工业智能导航
              <span className="brand-en">GLOBAL INDUSTRIAL AI</span>
            </strong>
          </span>
        </a>
        <button
          className="sidebar-toggle"
          aria-label={sidebarCollapsed ? "展开侧栏" : "收起侧栏"}
          title={sidebarCollapsed ? "展开侧栏" : "收起侧栏"}
          onClick={() => {
            const next = !sidebarCollapsed;
            setSidebarCollapsed(next);
            localStorage.setItem("sidebar-collapsed", String(next));
          }}
        >
          {sidebarCollapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
        </button>
        <div className="workspace-label">RESEARCH WORKSPACE</div>
        <nav>
          {[
            {
              id: "intelligence" as View,
              icon: LayoutDashboard,
              name: "情报展示",
              sub: "Intelligence",
            },
            {
              id: "sources" as View,
              icon: Settings2,
              name: "来源配置",
              sub: "Sources",
            },
            {
              id: "agents" as View,
              icon: Bot,
              name: "智能体记录",
              sub: "Agents",
            },
          ].map(({ id, icon: Icon, name, sub }) => (
            <button
              key={id}
              className={`nav-item ${view === id ? "active" : ""}`}
              onClick={() => navigate(id)}
              title={name}
            >
              <Icon size={19} />
              <span>
                {name}
                <small>{sub}</small>
              </span>
              {id === "intelligence" ? (
                <span className="nav-count">
                  {items.length.toString().padStart(2, "0")}
                </span>
              ) : (
                <ArrowUpRight size={14} />
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-divider" />
        <div className="workspace-label">研究关键词 · 已保存 {data?.settings.keywords.length ?? 0}</div>
        <div className="focus-links" aria-label="已保存的研究关键词">
          {(data?.settings.keywords ?? []).map((t, i) => (
            <button
              key={t}
              aria-pressed={view === "intelligence" && query === t}
              onClick={() => {
                setTopic("全部领域");
                setCategory("全部情报");
                setQuery(t);
                navigate("intelligence");
              }}
            >
              <i
                style={{
                  background: [
                    "#fb8847",
                    "#789aff",
                    "#ad91ee",
                    "#5cc8b0",
                    "#d5b567",
                    "#70899e",
                  ][i % 6],
                }}
              />
              {t}
            </button>
          ))}
          {data && data.settings.keywords.length === 0 && <button onClick={() => navigate("sources")}>尚未配置，前往添加</button>}
        </div>
        <div className="sidebar-bottom">
          <div className="agent-status">
            <span className={`status-dot ${active ? "pulse" : ""}`} />
            <span>
              {active ? "研究智能体运行中" : "每日研究计划"}
              <small>19:00 · Asia / Shanghai</small>
            </span>
            <Radio size={16} />
          </div>
        </div>
      </aside>
      {mobile && (
        <button
          aria-label="关闭导航"
          className="mobile-overlay"
          onClick={() => setMobile(false)}
        />
      )}
      <div className="main-shell">
        <main>
          <div className={`page-heading${view === "intelligence" ? " intelligence-heading" : ""}`}>
            <div>
              <button
                aria-label="打开导航"
                className="icon-button mobile-menu mobile-nav-trigger"
                onClick={() => setMobile(!mobile)}
              >
                <Menu size={20} />
              </button>
              <div className="eyebrow">
                <span />
                INDUSTRIAL INTELLIGENCE OBSERVATORY
              </div>
              <h1>
                {view === "intelligence"
                  ? "全球工业智能情报"
                  : view === "sources"
                    ? "定义你的研究边界"
                    : "让研究持续发生"}
                <span className="heading-dot">.</span>
              </h1>
              <p>
                {view === "intelligence"
                  ? "洞察技术演进，追踪产业变化，发现下一步的可能。"
                  : view === "sources"
                    ? "围绕炽橙的技术与业务方向，连接值得关注的信息。"
                    : "从信息采集到证据核验，每一步研究都有迹可循。"}
              </p>
            </div>
            {view !== "intelligence" && <div className="heading-actions">
              {!data?.editable && (
                <button
                  className="button secondary"
                  onClick={() => setUnlockOpen(true)}
                >
                  <KeyRound size={15} />
                  管理解锁
                </button>
              )}
              <button
                className="button secondary"
                onClick={() => void load()}
                disabled={refreshing}
              >
                <RefreshCw size={15} className={refreshing ? "spin" : ""} />
                刷新展示
              </button>
              <button
                className="button primary"
                onClick={() => void run("full")}
                disabled={running || active || !data?.editable}
              >
                <Sparkles size={16} />
                {active ? "研究进行中" : "全量重研"}
                <ArrowUpRight size={16} />
              </button>
            </div>}
          </div>
          {error && (
            <div className="error-banner" role="alert">
              {error}
              <button onClick={() => void load()}>重试连接</button>
            </div>
          )}
          {!data && !error && (
            <div className="loading-state">
              <Loader2 className="spin" />
              <p>正在连接研究工作台…</p>
            </div>
          )}
          {data && (
            <>
              {!data.editable && view !== "intelligence" && (
                <div className="readonly-banner">
                  当前工作区已锁定。输入管理口令后可保存配置、管理密钥并启动研究。
                  <button onClick={() => setUnlockOpen(true)}>
                    管理解锁 <KeyRound size={14} />
                  </button>
                </div>
              )}
              {view === "sources" ? (
                <SourceSettings data={data} save={save} />
              ) : view === "agents" ? (
                <AgentPanel
                  data={data}
                  save={save}
                  run={run}
                  busy={running || Boolean(active)}
                />
              ) : (
                <>
                  <div className="metrics-grid">
                    {[
                      {
                        label: "当前研究情报",
                        value: items.length,
                        icon: Radio,
                        note: "最近一次研究发布快照",
                        color: "orange",
                      },
                      {
                        label: "重大信号",
                        value: highlights.length,
                        icon: Zap,
                        note: "重要度 × 可信度 × 多源证据",
                        color: "purple",
                      },
                      {
                        label: "重点研究企业",
                        value: data.settings.companies.length,
                        icon: Target,
                        note: `${data.profiles.length} 份企业研究画像`,
                        color: "blue",
                      },
                      {
                        label: "已启用信息源",
                        value: data.settings.sources.filter((s) => s.enabled)
                          .length,
                        icon: Globe2,
                        note: "官网 · 研究平台 · RSS",
                        color: "green",
                      },
                    ].map((m) => (
                      <div className="metric" key={m.label}>
                        <div className="metric-label">
                          {m.label}
                          <m.icon size={17} className={`text-${m.color}`} />
                        </div>
                        <div className="metric-value">
                          {m.value.toString().padStart(2, "0")}
                          <span className={`metric-pill ${m.color}`}>
                            {m.color === "orange"
                              ? "INSIGHTS"
                              : m.color === "purple"
                                ? "PRIORITY"
                                : m.color === "blue"
                                  ? "COMPANIES"
                                  : "SOURCES"}
                          </span>
                        </div>
                        <div className="metric-note">
                          <span className={`tiny-dot ${m.color}`} />
                          {m.note}
                        </div>
                      </div>
                    ))}
                  </div>
                  <section className="highlights-section">
                    <div className="section-heading">
                      <h2>
                        <Flame size={18} className="text-orange" />
                        值得优先关注
                        <span className="small-label">PRIORITY SIGNALS</span>
                      </h2>
                      <span className="subtle">重大信息 · 核心提炼</span>
                    </div>
                    <PriorityCarousel items={highlights} onSelect={setDetail} />
                  </section>
                  <ResearchInsights items={items} report={data.insights} onSelect={setDetail} />
                  <div className="content-grid">
                    <section className="feed-section" id="intelligence-feed">
                      <div className="section-heading">
                        <h2>
                          情报动态
                          <span className="small-label">INTELLIGENCE FEED</span>
                        </h2>
                        <span className="subtle">
                          <span className="status-dot" />
                          融合更新
                        </span>
                      </div>
                      <div className="feed-controls">
                        <div className="search-field">
                          <Search size={16} />
                          <input
                            aria-label="搜索情报"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="搜索企业、技术或关键词…"
                          />
                        </div>
                        <select
                          aria-label="研究方向筛选"
                          value={topic}
                          onChange={(e) => setTopic(e.target.value)}
                        >
                          {["全部领域", ...topics].map((t) => (
                            <option key={t}>{t}</option>
                          ))}
                        </select>
                        <select
                          aria-label="情报排序"
                          value={sort}
                          onChange={(e) => setSort(e.target.value)}
                        >
                          <option value="importance">重要度优先</option>
                          <option value="date">最新发布</option>
                        </select>
                      </div>
                      <div className="category-tabs">
                        {["全部情报", ...visibleCategories].map((c) => (
                          <button
                            key={c}
                            className={category === c ? "selected" : ""}
                            onClick={() => setCategory(c)}
                          >
                            {c}
                            <span>{c === "全部情报" ? items.length : items.filter((item) => item.category === c).length}</span>
                          </button>
                        ))}
                      </div>
                      <div className="feed-list">
                        {filtered.map((item) => (
                          <button
                            className="feed-card"
                            key={item.id}
                            onClick={() => setDetail(item)}
                          >
                            <div
                              className={`feed-icon topic-${topics.indexOf(item.topic)}`}
                            >
                              <TopicIcon category={item.category} />
                            </div>
                            <div className="feed-card-content">
                              <div className="feed-meta">
                                <span
                                  className={`category-label topic-${topics.indexOf(item.topic)}`}
                                >
                                  {item.category}
                                </span>
                                <span>{item.company}</span>
                                <span className="feed-date">
                                  {new Date(effectiveDate(item)).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit", timeZone: "Asia/Shanghai" })}
                                  {!validDate(item.publishedAt) && " · 收录日"}
                                </span>
                              </div>
                              <h3>
                                {item.title}
                                {item.importance === "critical" && (
                                  <span className="priority-badge critical">
                                    重大
                                  </span>
                                )}
                              </h3>
                              <p>{item.summary}</p>
                              <div className="feed-footer">
                                <span className="tag">{item.topic}</span>
                                <span>
                                  <ShieldCheck size={12} />
                                  {`${item.evidence.length} 条原文证据`}
                                </span>
                                <ArrowUpRight size={15} />
                              </div>
                            </div>
                          </button>
                        ))}
                        {!filtered.length && (
                          <div className="empty-state">
                            <Search />
                            <p>
                              {items.length
                                ? "没有匹配的情报"
                                : "等待第一份真实研究"}
                            </p>
                            <small>
                              {items.length
                                ? "试试其他关键词或研究方向。"
                                : "配置来源与模型密钥后，开始一次研究。"}
                            </small>
                            {items.length > 0 && (
                              <button
                                className="button secondary"
                                onClick={() => {
                                  setQuery("");
                                  setTopic("全部领域");
                                  setCategory("全部情报");
                                }}
                              >
                                重置筛选
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="feed-end">
                        — 已展示 {filtered.length} 条情报 · 最近一次研究发布快照 —
                      </div>
                    </section>
                    <aside className="research-rail">
                      <section className="panel competitors">
                        <div className="panel-heading">
                          <h2>
                            <Target size={17} />
                            重点企业观察
                          </h2>
                          <span className="tag">持续追踪</span>
                        </div>
                        {data.profiles.map((p, i) => (
                          <button
                            className="company-card"
                            key={p.id}
                            onClick={() => setDetail(p)}
                          >
                            <div className="company-card-top">
                              <span className={`company-logo logo-${i % 4}`}>
                                {p.name === "NVIDIA" ? "N" : p.name.slice(0, 1)}
                              </span>
                              <div>
                                <strong>{p.name}</strong>
                                <small>
                                  {data.settings.companies.some((name) => name.replace(/\s+/g, "").toLowerCase() === p.name.replace(/\s+/g, "").toLowerCase())
                                    ? "已配置 · 持续刷新"
                                    : "研究发现 · 动态关注"}
                                </small>
                              </div>
                              <ArrowUpRight size={16} />
                            </div>
                            <p>{p.narrative}</p>
                            <div className="company-card-bottom">
                              <span>叙事</span>
                              <span>产品</span>
                              <span>融资</span>
                              <ChevronRight size={13} />
                            </div>
                          </button>
                        ))}
                        {!data.profiles.length && (
                          <div className="empty-state">
                            <Target />
                            <p>尚无企业画像</p>
                          </div>
                        )}
                      </section>
                      <section className="research-lens">
                        <div className="lens-icon">
                          <Boxes size={24} />
                        </div>
                        <div className="eyebrow">THE CHICHENG LENS</div>
                        <h3>
                          从炽橙的视角
                          <br />
                          理解产业变化
                        </h3>
                        <p>
                          自主几何内核 × 云化仿真 × AI
                          <br />
                          关注技术如何走向工业现场。
                        </p>
                        <a
                          href="https://www.czy3d.com/about-us/"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          企业研究基线 <ExternalLink size={13} />
                        </a>
                      </section>
                      <div className="rail-note">
                        <Clock3 size={15} />
                        <p>
                          每天 19:00 开始当天研究
                          <br />
                          <span>全量梳理与增量发现，统一融合展示</span>
                        </p>
                      </div>
                    </aside>
                  </div>
                </>
              )}
              <footer className="page-footer">
                <span>
                  GLOBAL <span className="text-orange">/</span> INDUSTRIAL
                  INTELLIGENCE NAVIGATOR
                </span>
                <span>
                  <Database size={12} />
                  {data.storage === "local"
                      ? "本地工作区"
                      : "Supabase 已连接"}{" "}
                  · 所有时间为北京时间
                </span>
              </footer>
            </>
          )}
        </main>
      </div>
      {detail && <Detail value={detail} close={() => setDetail(null)} />}
      {unlockOpen && (
        <dialog className="unlock-dialog" open>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void unlock();
            }}
          >
            <div className="eyebrow">WORKSPACE ACCESS</div>
            <h2>解锁管理操作</h2>
            <p>
              口令仅保存在当前浏览器会话中，用于保存配置和启动研究任务。
            </p>
            <input
              aria-label="管理口令"
              autoComplete="current-password"
              autoFocus
              type="password"
              value={tokenInput}
              onChange={(event) => setTokenInput(event.target.value)}
              placeholder="输入管理口令"
            />
            {unlockError && (
              <div className="unlock-error" role="alert">
                {unlockError}
              </div>
            )}
            <div>
              <button
                className="button secondary"
                type="button"
                onClick={() => {
                  setTokenInput("");
                  setUnlockError("");
                  setUnlockOpen(false);
                }}
              >
                取消
              </button>
              <button className="button primary" type="submit">
                <KeyRound size={15} /> 解锁
              </button>
            </div>
          </form>
        </dialog>
      )}
      {notice && (
        <div className="toast" role="status">
          <Check size={17} />
          <span>{notice}</span>
          <button aria-label="关闭提示" onClick={() => setNotice("")}>
            ×
          </button>
        </div>
      )}
    </div>
  );
}
function TopicIcon({ category }: { category: string }) {
  if (category === "技术前沿") return <Sparkles size={21} />;
  if (category === "资本动态") return <TrendingUp size={21} />;
  if (category === "解决方案" || category === "产品发布") return <Boxes size={21} />;
  if (category === "企业战略") return <Target size={21} />;
  return <Activity size={21} />;
}
