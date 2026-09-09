"use client";
import { useEffect, useState } from "react";
import {
  Globe2,
  Plus,
  Save,
  Trash2,
  X,
  Target,
  Hash,
  Rss,
  ExternalLink,
} from "lucide-react";
import { Dashboard, Settings, Source } from "@/lib/domain";
import { officialWebsite } from "@/lib/identity";

export function SourceSettings({
  data,
  save,
}: {
  data: Dashboard;
  save: (settings: Settings) => Promise<void>;
}) {
  const [form, setForm] = useState(structuredClone(data.settings));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [keyword, setKeyword] = useState("");
  const [company, setCompany] = useState("");
  const [source, setSource] = useState({
    name: "",
    url: "",
    kind: "website" as Source["kind"],
  });
  useEffect(() => {
    if (!dirty) setForm(structuredClone(data.settings));
  }, [data.settings, dirty]);
  function update(partial: Partial<Settings>) {
    setForm((f) => ({ ...f, ...partial }));
    setDirty(true);
  }
  async function submit() {
    setSaving(true);
    setError("");
    try {
      await save(form);
      setDirty(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  function addTag(type: "keywords" | "companies", text: string) {
    const values = text
      .split(/[,，\n]/)
      .map((v) => v.trim())
      .filter(Boolean);
    if (!values.length) return;
    update({ [type]: [...new Set([...form[type], ...values])] });
    if (type === "keywords") setKeyword("");
    else setCompany("");
  }
  function addSource(e: React.FormEvent) {
    e.preventDefault();
    try {
      const url = new URL(source.url);
      if (!["https:", "http:"].includes(url.protocol)) throw new Error();
      update({
        sources: [
          ...form.sources,
          {
            ...source,
            url: url.toString(),
            id: crypto.randomUUID(),
            enabled: true,
          },
        ],
      });
      setSource({ name: "", url: "", kind: "website" });
      setError("");
    } catch {
      setError("请输入有效的 HTTP / HTTPS 网址。");
    }
  }
  return (
    <div className="settings-layout">
      <div className="settings-main">
        <div className="section-heading">
          <h2>研究目标与范围</h2>
          <span className="tag">炽橙默认方向</span>
        </div>
        <div className="baseline panel">
          <div className="baseline-icon">
            <Target size={25} />
          </div>
          <div>
            <h3>工业原生物理 AI 与智能运维</h3>
            <p>
              以工业互联网、工业智能、3D 模型 + AI、制造业 + AI
              为主线，追踪几何内核、云化仿真、数字孪生、工业智能体及企业投融资披露。
            </p>
            <a
              href="https://www.czy3d.com/about-us/"
              target="_blank"
              rel="noopener noreferrer"
            >
              依据炽橙官网企业定位 <ExternalLink size={12} />
            </a>
          </div>
        </div>
        <fieldset
          disabled={!data.editable || saving}
          className="config-fieldset"
        >
          <div className="settings-pair">
            <section className="panel config-panel">
              <h3>
                <Hash size={17} />
                研究关键词<span>{form.keywords.length} / 50</span>
              </h3>
              <p className="muted">
                用于筛选情报与指导研究，可用逗号批量添加；保存后同步到左侧研究关键词。
              </p>
              <div className="editable-tags">
                {form.keywords.map((k) => (
                  <span key={k}>
                    {k}
                    <button
                      aria-label={`删除关键词 ${k}`}
                      onClick={() =>
                        update({
                          keywords: form.keywords.filter((v) => v !== k),
                        })
                      }
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
              <form
                className="inline-add"
                onSubmit={(e) => {
                  e.preventDefault();
                  addTag("keywords", keyword);
                }}
              >
                <input
                  aria-label="新增研究关键词"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="输入关键词，如：物理 AI"
                  maxLength={100}
                />
                <button aria-label="添加关键词" type="submit">
                  <Plus size={18} />
                </button>
              </form>
            </section>
            <section className="panel config-panel">
              <h3>
                <Target size={17} />
                重点研究企业<span>{form.companies.length} / 30</span>
              </h3>
              <p className="muted">
                跟踪企业叙事、定位、产品、技术与融资变化。
              </p>
              <div className="editable-tags company-tags">
                {form.companies.map((c) => (
                  <span key={c}>
                    {c}
                    <button
                      aria-label={`删除研究企业 ${c}`}
                      onClick={() =>
                        update({
                          companies: form.companies.filter((v) => v !== c),
                        })
                      }
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
              <form
                className="inline-add"
                onSubmit={(e) => {
                  e.preventDefault();
                  addTag("companies", company);
                }}
              >
                <input
                  aria-label="新增研究企业"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="输入企业名称"
                  maxLength={100}
                />
                <button aria-label="添加研究企业" type="submit">
                  <Plus size={18} />
                </button>
              </form>
            </section>
          </div>
          <div className="section-heading source-heading">
            <h2>企业官网档案</h2>
          </div>
          <div className="panel" style={{ padding: 20, marginBottom: 24 }}>
            <p className="muted">官网用于提取企业定位、产品和技术能力，资料不受新闻 30 天限制。可补充或修正每家企业的官网。</p>
            {form.companies.map((name) => (
              <label key={name} style={{ display: "grid", gridTemplateColumns: "100px minmax(0, 1fr)", gap: 12, alignItems: "center", marginTop: 12 }}>
                {name}
                <input aria-label={`${name}官网`} type="url" placeholder="https://企业官网"
                  value={officialWebsite(name, form.companyWebsites) ?? ""}
                  onChange={(e) => {
                    const websites = { ...form.companyWebsites };
                    if (e.target.value) websites[name] = e.target.value;
                    else delete websites[name];
                    update({ companyWebsites: websites });
                  }} />
              </label>
            ))}
          </div>
          <div className="section-heading source-heading">
            <h2>信息来源</h2>
            <span className="subtle">
              {form.sources.filter((s) => s.enabled).length} 个已启用 / 最多 30
              个
            </span>
          </div>
          <section className="panel sources-table">
            {form.sources.map((s) => (
              <div className="source-row" key={s.id}>
                <span className={`source-icon ${s.kind}`}>
                  {s.kind === "rss" ? (
                    <Rss size={19} />
                  ) : (
                    <Globe2 size={19} />
                  )}
                </span>
                <div className="source-info">
                  <input
                    aria-label={`来源名称 ${s.name}`}
                    value={s.name}
                    onChange={(e) =>
                      update({
                        sources: form.sources.map((v) =>
                          v.id === s.id ? { ...v, name: e.target.value } : v,
                        ),
                      })
                    }
                  />
                  <input
                    aria-label={`来源网址 ${s.name}`}
                    value={s.url}
                    onChange={(e) =>
                      update({
                        sources: form.sources.map((v) =>
                          v.id === s.id ? { ...v, url: e.target.value } : v,
                        ),
                      })
                    }
                  />
                </div>
                <span className="source-type">
                  {s.kind === "rss" ? "RSS" : "官方网站"}
                </span>
                <button
                  role="switch"
                  aria-checked={s.enabled}
                  aria-label={`启用来源 ${s.name}`}
                  className={`toggle ${s.enabled ? "on" : ""}`}
                  onClick={() =>
                    update({
                      sources: form.sources.map((v) =>
                        v.id === s.id ? { ...v, enabled: !v.enabled } : v,
                      ),
                    })
                  }
                >
                  <span />
                </button>
                <button
                  className="icon-button delete"
                  aria-label={`删除来源 ${s.name}`}
                  onClick={() =>
                    update({
                      sources: form.sources.filter((v) => v.id !== s.id),
                    })
                  }
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </section>
          <form className="panel add-source" onSubmit={addSource}>
            <h3>
              <Plus size={18} />
              添加信息源
            </h3>
            <div className="add-source-fields">
              <label>
                来源名称
                <input
                  required
                  maxLength={100}
                  placeholder="如：某企业新闻中心"
                  value={source.name}
                  onChange={(e) =>
                    setSource({ ...source, name: e.target.value })
                  }
                />
              </label>
              <label>
                来源类型
                <select
                  value={source.kind}
                  onChange={(e) =>
                    setSource({
                      ...source,
                      kind: e.target.value as Source["kind"],
                    })
                  }
                >
                  <option value="website">网站主页 / 文章</option>
                  <option value="rss">RSS / Atom</option>
                </select>
              </label>
              <label>
                目标网址
                <input
                  required
                  type="url"
                  placeholder="https://…"
                  value={source.url}
                  onChange={(e) =>
                    setSource({ ...source, url: e.target.value })
                  }
                />
              </label>
              <button className="button secondary" type="submit">
                <Plus size={15} />
                添加
              </button>
            </div>
            <p className="muted">
              支持公开网站、文章和 RSS；受限页面的采集情况会记录在智能体日志中。
            </p>
          </form>
        </fieldset>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="save-bar">
          <span>{dirty ? "有未保存的修改" : "所有配置已同步"}</span>
          <button
            className="button primary"
            onClick={submit}
            disabled={!dirty || saving || !data.editable}
          >
            <Save size={16} />
            {saving ? "保存中…" : "保存来源配置"}
          </button>
        </div>
      </div>
      <aside className="settings-aside panel">
        <span className="eyebrow">RESEARCH PRINCIPLES</span>
        <h3>让信息真正服务研究</h3>
        <div>
          <b>01</b>
          <h4>研究方向固定，范围可拓展</h4>
          <p>
            默认关注工业原生 AI
            的技术与商业路径。关键词和研究企业决定每次分析的关注重点。
          </p>
        </div>
        <div>
          <b>02</b>
          <h4>官方披露优先</h4>
          <p>
            优先企业官网、论文与监管披露。融资金额和轮次仅从可追溯的材料中提取。
          </p>
        </div>
        <div>
          <b>03</b>
          <h4>新闻滚动，知识积累</h4>
          <p>
            所有情报统一保留最近 30 天；每日增量融合当天发现，并自动剔除第 31 天以前的信息。
          </p>
        </div>
        <div>
          <b>04</b>
          <h4>采集与分析边界透明</h4>
          <p>
            网址直接采集；关键词用于内容筛选。服务端接入搜索服务后，可扩展到跨站检索。
          </p>
        </div>
      </aside>
    </div>
  );
}
