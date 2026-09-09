"use client";
import { useMemo, useState } from "react";
import { ArrowUpRight, ChartNoAxesCombined, Layers3, Radar } from "lucide-react";
import { Item } from "@/lib/domain";
import { researchAnalysis } from "@/lib/analysis";

export function ResearchInsights({ items, onSelect, onFilter }: {
  items: Item[];
  onSelect: (item: Item) => void;
  onFilter: (topic?: string, category?: Item["category"]) => void;
}) {
  const [days, setDays] = useState<7 | 14>(7);
  const report = useMemo(() => researchAnalysis(items, days), [items, days]);
  const max = Math.max(1, ...report.movement.flatMap((row) => [row.recent, row.earlier]));
  return <section className="research-insights" aria-label="研究信号分析">
    <div className="insight-intro">
      <div><span className="eyebrow">RESEARCH PULSE</span><h2>从信息，到值得跟进的变化<span>。</span></h2>
        <p>{report.total ? `当前收录 ${report.total} 条独立事件，其中 ${report.major} 条达到重大信号标准。${report.actions[0] ? `“${report.actions[0].category}”是当前材料最集中的产业动作。` : ""}` : "研究完成后，将从事件、产业动作与原文证据中归纳关注方向。"}</p>
      </div>
      <div className="analysis-quality"><strong>{report.total ? Math.round(report.dated / report.total * 100) : 0}<small>%</small></strong><span>原文日期覆盖率</span><small>{report.fallback} 条按首次收录日保留</small></div>
    </div>
    {report.focus.length > 0 && <div className="focus-briefs">{report.focus.map((focus, index) => <article key={focus.topic} className="focus-brief">
      <div className="focus-brief-top"><span>关注方向 / 0{index + 1}</span><button onClick={() => onFilter(focus.topic)}>{focus.topic}<ArrowUpRight size={14} /></button></div>
      <button className="focus-story" onClick={() => onSelect(focus.example)}><h3>{focus.example.title}</h3><p>{focus.example.summary}</p></button>
      <div className="focus-proof"><span>{focus.count} 条事件</span><span>{focus.companies} 家企业</span><span>{focus.sources} 个来源页</span></div>
    </article>)}</div>}
    <div className="insight-panels">
      <section className="panel movement-panel">
        <div className="panel-heading"><h2><ChartNoAxesCombined size={18} />哪些领域的信号在变化</h2><div className="analysis-period" aria-label="对比周期">{([7, 14] as const).map((value) => <button key={value} aria-pressed={days === value} onClick={() => setDays(value)}>{value} 天</button>)}</div></div>
        <div className="movement-summary"><strong>{report.current}<small> 条</small></strong><span>最近 {days} 天<span className="movement-compare">此前等长周期 {report.previous} 条 · {report.previous ? `净变化 ${report.current - report.previous > 0 ? "+" : ""}${report.current - report.previous} 条` : "尚无前期样本可比较"}</span></span></div>
        <div className="movement-legend"><span><i />最近 {days} 天</span><span><i />此前 {days} 天</span></div>
        <div className="movement-rows">{report.movement.length ? report.movement.map((row) => <button key={row.topic} className="movement-row" onClick={() => onFilter(row.topic)} aria-label={`${row.topic}，最近${row.recent}条，此前${row.earlier}条，查看情报`}>
          <span>{row.topic}</span><div className="comparison-bars"><i style={{ width: `${row.recent / max * 100}%` }} /><i style={{ width: `${row.earlier / max * 100}%` }} /></div><strong>{row.recent}<small> / {row.earlier}</small></strong><em>{!row.earlier ? "前期无样本" : `${row.delta > 0 ? "+" : ""}${row.delta} 条`}</em>
        </button>) : <p className="chart-empty">对比窗口内暂无带原文日期的事件。</p>}</div>
        <p className="analysis-note">仅比较有原文发布日期的去重事件；{report.fallback} 条日期兜底资料不参与时间趋势。数量反映当前采集覆盖，不能直接代表行业增长率。</p>
      </section>
      <section className="panel action-panel">
        <div className="panel-heading"><h2><Layers3 size={18} />产业正在发生什么</h2><span className="subtle">最近 30 天收录</span></div>
        <div className="action-rows">{report.actions.length ? report.actions.map((action) => <div key={action.category} className="action-row">
          <button className="action-distribution" onClick={() => onFilter(undefined, action.category)}><span>{action.category}</span><div><i style={{ width: `${action.count / report.total * 100}%` }} /></div><strong>{action.count}<small> 条 · {Math.round(action.count / report.total * 100)}%</small></strong></button>
          <button className="action-example" onClick={() => onSelect(action.example)}><span>{action.example.title}</span><ArrowUpRight size={13} /></button>
        </div>) : <p className="chart-empty">等待研究材料形成产业动作分布。</p>}</div>
        <p className="analysis-note"><Radar size={13} />点击类别筛选情报，点击事件查看事实与原文证据。未采集到的类别不推断为“没有行业活动”。</p>
      </section>
    </div>
  </section>;
}
