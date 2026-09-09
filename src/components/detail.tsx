"use client";
import { useEffect, useRef } from "react";
import { X, ArrowUpRight, ExternalLink, Building2 } from "lucide-react";
import { Item, Profile, effectiveDate, validDate } from "@/lib/domain";

export function Detail({
  value,
  close,
}: {
  value: Item | Profile;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  const item = "category" in value ? value : undefined;
  const profile = "narrative" in value ? value : undefined;
  return (
    <dialog
      className="detail-dialog"
      ref={ref}
      onCancel={close}
      onClick={(e) => {
        if (e.target === ref.current) close();
      }}
    >
      <article>
        <header>
          <span className="eyebrow">
            {item ? "INTELLIGENCE BRIEF" : "COMPANY INTELLIGENCE"}
          </span>
          <button aria-label="关闭详情" className="icon-button" onClick={close}>
            <X size={20} />
          </button>
        </header>
        <h2>{item?.title ?? profile?.name}</h2>
        {item && (
          <>
            <div className="detail-meta">
              <span className="tag">{item.category}</span>
              <span>{item.topic}</span>
              <span>
                {new Date(effectiveDate(item)).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" })} · {validDate(item.publishedAt) ? "原文发布日期" : "首次收录日期"}
              </span>
            </div>
            <h3>核心事实</h3>
            {!validDate(item.publishedAt) && <p className="muted">原文未披露可核验日期，按首次生成／收录日计算 30 天展示期限；重新发现不会延长保留时间。</p>}
            <p>{item.summary}</p>
            <h3>研究置信度</h3>
            <p>
              {Math.round(item.confidence * 100)}% · 模型评估，非独立审计结论
            </p>
          </>
        )}
        {profile && (
          <>
            <div className="detail-meta">
              <Building2 size={16} /> {profile.basis === "official" ? "企业官网档案 · 企业自述" : "企业持续跟踪档案"}
            </div>
            {profile.evidence.length > 0 && <p className="muted">最近核验：{new Date(profile.updatedAt).toLocaleDateString("zh-CN")} · 官网档案长期保留，独立于新闻时间窗口</p>}
            <h3>企业叙事逻辑</h3>
            <p>{profile.narrative || "暂无可核验披露"}</p>
            <h3>市场定位</h3>
            <p>{profile.positioning || "暂无可核验披露"}</p>
            <h3>产品与解决方案</h3>
            <div className="tag-group">
              {!profile.solutions.length && <p>官网产品资料尚未核验，请检查官网配置或查看研究日志。</p>}
              {profile.solutions.map((s) => (
                <span className="tag" key={s}>
                  {s}
                </span>
              ))}
            </div>
            <h3>新技术与能力</h3>
            <ul>
              {!profile.capabilities.length && <li>官网技术资料尚未核验，请检查官网配置或查看研究日志。</li>}
              {profile.capabilities.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            <h3>投融资披露</h3>
            <p>{profile.funding}</p>
          </>
        )}
        <div className="implication">
          <span>
            <ArrowUpRight size={18} /> 对炽橙的启示 · 分析判断
          </span>
          <p>{value.implication}</p>
        </div>
        <h3>
          来源与原文证据 <span className="muted">{value.evidence.length}</span>
        </h3>
        {value.evidence.length ? (
          value.evidence.map((e, i) => (
            <div className="evidence" key={e.url + i}>
              <a href={e.url} target="_blank" rel="noopener noreferrer">
                {e.title || new URL(e.url).hostname}
                <ExternalLink size={14} />
              </a>
              <blockquote>{e.quote}</blockquote>
              <small>{new URL(e.url).hostname}</small>
            </div>
          ))
        ) : (
          <p className="muted">暂无可核验的来源与原文证据。</p>
        )}
      </article>
    </dialog>
  );
}
