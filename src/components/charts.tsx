"use client";
import { Item } from "@/lib/domain";

const palette = ["#ff853f", "#7395ff", "#55c8aa", "#ae91ef"];
const weight = { critical: 3, high: 2, normal: 1 } as const;
const itemDate = (item: Item) => Date.parse(item.publishedAt ?? item.observedAt);

function rankedTopics(items: Item[], limit: number) {
  const scores = new Map<string, number>();
  for (const item of items)
    scores.set(item.topic, (scores.get(item.topic) ?? 0) + weight[item.importance]);
  return [...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

export function IndustryTrend({ items }: { items: Item[] }) {
  const now = new Date();
  const buckets = Array.from({ length: 6 }, (_, index) => {
    const end = new Date(now.getTime() - (5 - index) * 5 * 86400000);
    const start = new Date(end.getTime() - 5 * 86400000);
    return { start: start.getTime(), end: end.getTime(), label: `${end.getMonth() + 1}/${end.getDate()}` };
  });
  const topics = rankedTopics(items, 3).map(([topic]) => topic);
  const series = topics.map((topic) => buckets.map((bucket) => items
    .filter((item) => item.topic === topic && itemDate(item) > bucket.start && itemDate(item) <= bucket.end)
    .reduce((sum, item) => sum + weight[item.importance], 0)));
  const max = Math.max(2, ...series.flat());
  if (!topics.length) return <p className="chart-empty">研究完成后生成近 30 天行业趋势。</p>;
  return <div className="trend-chart">
    <div className="chart-legend">{topics.map((topic, i) => <span key={topic}><i style={{ background: palette[i] }} />{topic}</span>)}</div>
    <svg viewBox="0 0 580 185" role="img" aria-label={`近30天行业趋势：${topics.join("、")}`}>
      {[0, 1, 2, 3].map((i) => <g key={i}><line x1="32" y1={15 + i * 42} x2="567" y2={15 + i * 42} stroke="#28313d" strokeDasharray="3 5" /><text x="4" y={20 + i * 42} fill="#778496" fontSize="11">{Math.round(max * (1 - i / 3))}</text></g>)}
      {series.map((values, si) => {
        const points = values.map((value, i) => `${40 + i * 104},${141 - value / max * 125}`);
        return <g key={topics[si]}><polyline points={points.join(" ")} fill="none" stroke={palette[si]} strokeWidth="2.5" strokeLinejoin="round" />{values.map((value, i) => <circle key={i} cx={40 + i * 104} cy={141 - value / max * 125} r="3.5" fill={palette[si]}><title>{buckets[i].label} {topics[si]}：{value} 分</title></circle>)}</g>;
      })}
      {buckets.map((bucket, i) => <text key={bucket.label} x={40 + i * 104} y="175" textAnchor="middle" fill="#8c98aa" fontSize="11">{bucket.label}</text>)}
    </svg>
  </div>;
}

const stopWords = new Set(["发布", "公司", "企业", "行业", "进行", "以及", "通过", "宣布", "最新", "相关", "技术", "产品", "市场", "能力", "方案"]);

export function HotKeywords({ items, keywords, onSelect }: { items: Item[]; keywords: string[]; onSelect: (value: string) => void }) {
  const scores = new Map<string, number>();
  const segmenter = new Intl.Segmenter("zh-CN", { granularity: "word" });
  for (const item of items) {
    const terms = new Set<string>([item.company, item.topic]);
    for (const segment of segmenter.segment(`${item.title} ${item.summary}`)) {
      const term = segment.segment.trim();
      if (segment.isWordLike && term.length >= 2 && term.length <= 16 && !stopWords.has(term)) terms.add(term);
    }
    for (const keyword of keywords)
      if (`${item.title} ${item.summary}`.toLowerCase().includes(keyword.toLowerCase())) terms.add(keyword);
    for (const term of terms) scores.set(term, (scores.get(term) ?? 0) + weight[item.importance]);
  }
  const terms = [...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14);
  const max = Math.max(1, ...terms.map(([, score]) => score));
  if (!terms.length) return <p className="chart-empty">等待有效材料形成动态热点热词。</p>;
  return <div className="keyword-cloud">{terms.map(([term, score], index) => <button key={term} onClick={() => onSelect(term)} style={{ fontSize: `${12 + score / max * 8}px`, borderColor: `${palette[index % palette.length]}66` }}><span>{term}</span><small>{score}</small></button>)}</div>;
}

export function FieldTrend({ items, onTopic }: { items: Item[]; onTopic: (topic: string) => void }) {
  const now = Date.now();
  const rows = rankedTopics(items, 6).map(([topic, total]) => {
    const current = items.filter((item) => item.topic === topic && now - itemDate(item) <= 7 * 86400000).reduce((sum, item) => sum + weight[item.importance], 0);
    const previous = items.filter((item) => item.topic === topic && now - itemDate(item) > 7 * 86400000).reduce((sum, item) => sum + weight[item.importance], 0) / (23 / 7);
    const momentum = previous ? Math.round((current - previous) / previous * 100) : current ? 100 : 0;
    return { topic, total, momentum };
  });
  const max = Math.max(1, ...rows.map((row) => row.total));
  if (!rows.length) return <p className="chart-empty">等待数据形成领域趋势。</p>;
  return <div className="field-trends">{rows.map((row) => <button key={row.topic} onClick={() => onTopic(row.topic)}><span>{row.topic}</span><i><b style={{ width: `${row.total / max * 100}%` }} /></i><em className={row.momentum > 10 ? "up" : row.momentum < -10 ? "down" : "stable"}>{row.momentum > 0 ? "+" : ""}{row.momentum}%</em></button>)}<small>动量：最近 7 天与此前 23 天日均信号强度对比</small></div>;
}
