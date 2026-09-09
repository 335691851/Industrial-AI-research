"use client";
import { useId, useState } from "react";
import { ArrowUpRight, ChevronDown, Lightbulb, ScanText } from "lucide-react";
import { Item, InsightReport } from "@/lib/domain";

export function ResearchInsights({ items, report, onSelect }: {
  items: Item[];
  report?: InsightReport;
  onSelect: (item: Item) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const contentId = useId();
  const byId = new Map(items.map((item) => [item.id, item]));
  return <section className={`synthesis-panel panel${expanded ? " is-expanded" : " is-compact"}`} aria-label="综合洞察">
    <div className="synthesis-heading"><div><Lightbulb size={19} /><h2>综合洞察</h2><span>INDUSTRY PERSPECTIVE</span></div>
      {report && <small>{new Date(report.generatedAt).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" })} 更新 · 分析判断</small>}
    </div>
    {report ? <>
      <div id={contentId} className="synthesis-content" role="region" aria-label="洞察摘要与结论" tabIndex={expanded ? undefined : 0}>
      <div className="synthesis-overview"><span>核心研判</span><p>{report.overview}</p></div>
      {!expanded && <div className="synthesis-concepts" aria-label="结论摘要">{report.conclusions.map((conclusion, index) => <span key={conclusion.concept + index}>{conclusion.concept}</span>)}</div>}
      {expanded && <div className="synthesis-conclusions">{report.conclusions.map((conclusion, index) => <article className="synthesis-conclusion" key={conclusion.concept + index}>
        <div className="conclusion-number">{String(index + 1).padStart(2, "0")}</div>
        <div className="conclusion-body"><h3>{conclusion.concept}</h3><p className="conclusion-judgment">{conclusion.judgment}</p>
          <p className="conclusion-reasoning">{conclusion.reasoning}</p>
          <div className="conclusion-implications"><div><h4>对炽橙的启示</h4><p>{conclusion.implication}</p></div><div><h4>下一步验证</h4><p>{conclusion.watchpoint}</p></div></div>
          <details className="conclusion-evidence"><summary><ScanText size={14} />查看判断依据 · {conclusion.evidenceIds.length} 条事件</summary>
            {conclusion.evidenceIds.map((id) => { const item = byId.get(id); return item ? <button key={id} onClick={() => onSelect(item)}><span>{item.title}</span><ArrowUpRight size={14} /></button> : null; })}
          </details>
        </div>
      </article>)}</div>}
      </div>
      <div className="synthesis-footer"><span>基于有效情报的分析判断</span><button type="button" aria-expanded={expanded} aria-controls={contentId} onClick={() => setExpanded(!expanded)}>{expanded ? "收起详细洞察" : `展开完整洞察 · ${report.conclusions.length} 项结论`}<ChevronDown size={15} /></button></div>
    </> : <div className="synthesis-empty"><Lightbulb size={24} /><div><h3>综合研判待更新</h3><p>{items.length >= 2 ? "下一次研究将结合当前完整情报生成共性变化、竞争逻辑与业务启示。已有结论在依据变化或过期后会等待重新生成。" : "有效材料积累后，在每次研究结束时生成有证据支撑的整体判断。"}</p></div></div>}
  </section>;
}
