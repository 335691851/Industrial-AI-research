"use client";
import { ArrowUpRight, Lightbulb, ScanText } from "lucide-react";
import { Item, InsightReport } from "@/lib/domain";

export function ResearchInsights({ items, report, onSelect }: {
  items: Item[];
  report?: InsightReport;
  onSelect: (item: Item) => void;
}) {
  const byId = new Map(items.map((item) => [item.id, item]));
  return <section className="synthesis-panel panel" aria-label="综合洞察">
    <div className="synthesis-heading"><div><Lightbulb size={19} /><h2>综合洞察</h2><span>INDUSTRY PERSPECTIVE</span></div>
      {report && <small>{new Date(report.generatedAt).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" })} 更新 · 分析判断</small>}
    </div>
    {report ? <>
      <div className="synthesis-overview"><span>核心研判</span><p>{report.overview}</p></div>
      <div className="synthesis-conclusions">{report.conclusions.map((conclusion, index) => <article className="synthesis-conclusion" key={conclusion.concept + index}>
        <div className="conclusion-number">{String(index + 1).padStart(2, "0")}</div>
        <div className="conclusion-body"><h3>{conclusion.concept}</h3><p className="conclusion-judgment">{conclusion.judgment}</p>
          <p className="conclusion-reasoning">{conclusion.reasoning}</p>
          <div className="conclusion-implications"><div><h4>对炽橙的启示</h4><p>{conclusion.implication}</p></div><div><h4>下一步验证</h4><p>{conclusion.watchpoint}</p></div></div>
          <details className="conclusion-evidence"><summary><ScanText size={14} />查看判断依据 · {conclusion.evidenceIds.length} 条事件</summary>
            {conclusion.evidenceIds.map((id) => { const item = byId.get(id); return item ? <button key={id} onClick={() => onSelect(item)}><span>{item.title}</span><ArrowUpRight size={14} /></button> : null; })}
          </details>
        </div>
      </article>)}</div>
      <p className="synthesis-footnote">基于当前有效情报的跨事件分析，结论可随新证据修正；展开判断依据可查看事实与原文。</p>
    </> : <div className="synthesis-empty"><Lightbulb size={24} /><div><h3>综合研判待更新</h3><p>{items.length >= 2 ? "下一次研究将结合当前完整情报生成共性变化、竞争逻辑与业务启示。已有结论在依据变化或过期后会等待重新生成。" : "有效材料积累后，在每次研究结束时生成有证据支撑的整体判断。"}</p></div></div>}
  </section>;
}
