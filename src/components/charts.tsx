"use client";
import { Item, topics } from "@/lib/domain";

export function TrendChart({ items }: { items: Item[] }) {
  const today = new Date();
  const dates = Array.from({ length: 5 }, (_, i) => {
    const d = new Date(today.getTime() - (4 - i) * 86400000);
    return {
      key: d.toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" }),
      label: d.toLocaleDateString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        timeZone: "Asia/Shanghai",
      }),
    };
  });
  const lines = ["3D 模型 + AI", "工业智能", "制造业 + AI"];
  const colors = ["#ff853f", "#7395ff", "#55c8aa"];
  const series = lines.map((topic) =>
    dates.map(
      (d) =>
        items.filter(
          (i) =>
            i.topic === topic &&
            i.publishedAt &&
            new Date(i.publishedAt).toLocaleDateString("en-CA", {
              timeZone: "Asia/Shanghai",
            }) === d.key,
        ).length,
    ),
  );
  const max = Math.max(2, ...series.flat());
  return (
    <div className="trend-chart">
      <div className="chart-legend">
        {lines.map((l, i) => (
          <span key={l}>
            <i style={{ background: colors[i] }} />
            {l}
          </span>
        ))}
      </div>
      <svg
        viewBox="0 0 580 185"
        role="img"
        aria-label="近5天主题情报数量趋势，按原文发布日期统计"
      >
        <defs>
          <linearGradient id="orangeFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ff853f" stopOpacity=".16" />
            <stop offset="100%" stopColor="#ff853f" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3].map((i) => (
          <g key={i}>
            <line
              x1="32"
              y1={15 + i * 42}
              x2="567"
              y2={15 + i * 42}
              stroke="#28313d"
              strokeDasharray="3 5"
            />
            <text x="4" y={20 + i * 42} fill="#778496" fontSize="11">
              {Math.round(max * (1 - i / 3))}
            </text>
          </g>
        ))}
        {series.map((values, s) => {
          const points = values.map(
            (v, i) => `${40 + i * 130},${141 - (v / max) * 125}`,
          );
          return (
            <g key={s}>
              {s === 0 && (
                <polygon
                  points={`40,141 ${points.join(" ")} 560,141`}
                  fill="url(#orangeFill)"
                />
              )}
              <polyline
                points={points.join(" ")}
                fill="none"
                stroke={colors[s]}
                strokeWidth="2.5"
                strokeLinejoin="round"
              />
              {values.map((v, i) => (
                <circle
                  key={i}
                  cx={40 + i * 130}
                  cy={141 - (v / max) * 125}
                  r="3.5"
                  fill={colors[s]}
                >
                  <title>
                    {dates[i].label} {lines[s]}：{v} 条
                  </title>
                </circle>
              ))}
            </g>
          );
        })}
        {dates.map((d, i) => (
          <text
            key={d.key}
            x={40 + i * 130}
            y="175"
            textAnchor="middle"
            fill="#8c98aa"
            fontSize="12"
          >
            {d.label}
          </text>
        ))}
      </svg>
    </div>
  );
}
export function Heatmap({
  items,
  onTopic,
}: {
  items: Item[];
  onTopic: (topic: string) => void;
}) {
  const companies = [...new Set(items.map((i) => i.company))]
    .filter((c) => c !== "行业综合")
    .slice(0, 4);
  return (
    <div className="heatmap">
      <div className="heat-row heat-heading">
        <span>研究方向</span>
        {companies.map((c) => (
          <span key={c} title={c}>
            {c}
          </span>
        ))}
      </div>
      {topics.slice(0, 5).map((topic) => (
        <button onClick={() => onTopic(topic)} className="heat-row" key={topic}>
          <span>{topic}</span>
          {companies.map((c) => {
            const count = items.filter(
              (i) => i.topic === topic && i.company === c,
            ).length;
            return (
              <span
                key={c}
                className={`heat-cell heat-${Math.min(count, 3)}`}
                title={`${topic} · ${c}：${count} 条`}
              >
                {count || "·"}
              </span>
            );
          })}
        </button>
      ))}
      {!companies.length && (
        <p className="muted">等待情报生成后形成热点分布。</p>
      )}
      <div className="heat-scale">
        <span>按情报条数统计</span>
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
