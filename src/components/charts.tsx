"use client";
import { Item } from "@/lib/domain";

const palette = ["#ff853f", "#7395ff", "#55c8aa"];
const weight = { critical: 3, high: 2, normal: 1 } as const;

function rankedTopics(items: Item[], limit: number) {
  const scores = new Map<string, number>();
  for (const item of items)
    scores.set(item.topic, (scores.get(item.topic) ?? 0) + weight[item.importance]);
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([topic]) => topic);
}

export function ActivityTrend({ items }: { items: Item[] }) {
  const today = new Date();
  const dates = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today.getTime() - (6 - index) * 86400000);
    return {
      key: date.toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" }),
      label: date.toLocaleDateString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        timeZone: "Asia/Shanghai",
      }),
    };
  });
  const topics = rankedTopics(items, 3);
  const series = topics.map((topic) =>
    dates.map(
      (date) =>
        items.filter(
          (item) =>
            item.topic === topic &&
            new Date(item.observedAt).toLocaleDateString("en-CA", {
              timeZone: "Asia/Shanghai",
            }) === date.key,
        ).length,
    ),
  );
  const max = Math.max(2, ...series.flat());
  if (!topics.length)
    return <p className="chart-empty">研究完成后，这里将按实际主题生成近 7 天趋势。</p>;
  return (
    <div className="trend-chart">
      <div className="chart-legend">
        {topics.map((topic, index) => (
          <span key={topic}>
            <i style={{ background: palette[index] }} />
            {topic}
          </span>
        ))}
      </div>
      <svg
        viewBox="0 0 580 185"
        role="img"
        aria-label={`近7天情报活跃趋势：${topics.join("、")}`}
      >
        {[0, 1, 2, 3].map((index) => (
          <g key={index}>
            <line
              x1="32"
              y1={15 + index * 42}
              x2="567"
              y2={15 + index * 42}
              stroke="#28313d"
              strokeDasharray="3 5"
            />
            <text x="4" y={20 + index * 42} fill="#778496" fontSize="11">
              {Math.round(max * (1 - index / 3))}
            </text>
          </g>
        ))}
        {series.map((values, seriesIndex) => {
          const points = values.map(
            (value, index) =>
              `${40 + index * (520 / 6)},${141 - (value / max) * 125}`,
          );
          return (
            <g key={topics[seriesIndex]}>
              <polyline
                points={points.join(" ")}
                fill="none"
                stroke={palette[seriesIndex]}
                strokeWidth="2.5"
                strokeLinejoin="round"
              />
              {values.map((value, index) => (
                <circle
                  key={dates[index].key}
                  cx={40 + index * (520 / 6)}
                  cy={141 - (value / max) * 125}
                  r="3.5"
                  fill={palette[seriesIndex]}
                >
                  <title>
                    {dates[index].label} {topics[seriesIndex]}：{value} 条
                  </title>
                </circle>
              ))}
            </g>
          );
        })}
        {dates.map((date, index) => (
          <text
            key={date.key}
            x={40 + index * (520 / 6)}
            y="175"
            textAnchor="middle"
            fill="#8c98aa"
            fontSize="11"
          >
            {date.label}
          </text>
        ))}
      </svg>
    </div>
  );
}

export function SignalMatrix({
  items,
  onTopic,
}: {
  items: Item[];
  onTopic: (topic: string) => void;
}) {
  const topics = rankedTopics(items, 5);
  const categoryCounts = new Map<string, number>();
  const signalScores = new Map<string, number>();
  for (const item of items) {
    categoryCounts.set(
      item.category,
      (categoryCounts.get(item.category) ?? 0) + 1,
    );
    const key = `${item.topic}\u0000${item.category}`;
    signalScores.set(key, (signalScores.get(key) ?? 0) + weight[item.importance]);
  }
  const categories = [...categoryCounts.keys()]
    .sort((a, b) => categoryCounts.get(b)! - categoryCounts.get(a)!)
    .slice(0, 4);
  if (!topics.length || !categories.length)
    return <p className="chart-empty">等待有效情报形成动态热点信号矩阵。</p>;
  const columns = {
    gridTemplateColumns: `104px repeat(${categories.length}, 1fr)`,
  };
  return (
    <div className="heatmap">
      <div className="heat-row heat-heading" style={columns}>
        <span>动态主题</span>
        {categories.map((category) => (
          <span key={category} title={category}>
            {category}
          </span>
        ))}
      </div>
      {topics.map((topic) => (
        <button
          onClick={() => onTopic(topic)}
          className="heat-row"
          style={columns}
          key={topic}
        >
          <span>{topic}</span>
          {categories.map((category) => {
            const score = signalScores.get(`${topic}\u0000${category}`) ?? 0;
            return (
              <span
                key={category}
                className={`heat-cell heat-${Math.min(score, 3)}`}
                title={`${topic} · ${category}：信号强度 ${score}`}
              >
                {score || "·"}
              </span>
            );
          })}
        </button>
      ))}
      <div className="heat-scale">
        <span>综合数量与重要级别</span>
        <span>
          低 <i className="heat-0" />
          <i className="heat-1" />
          <i className="heat-2" />
          <i className="heat-3" /> 高
        </span>
      </div>
    </div>
  );
}
