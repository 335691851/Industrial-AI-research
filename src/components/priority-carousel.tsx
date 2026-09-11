"use client";
import { useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ShieldCheck } from "lucide-react";
import { Item, dedupeEvidence, priorityScore } from "@/lib/domain";

export function PriorityCarousel({
  items,
  onSelect,
}: {
  items: Item[];
  onSelect: (item: Item) => void;
}) {
  const rail = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const move = (direction: number) =>
    rail.current?.scrollBy({
      left: direction * rail.current.clientWidth * 0.92,
      behavior: "smooth",
    });
  const syncProgress = () => {
    const node = rail.current;
    if (!node) return;
    const max = node.scrollWidth - node.clientWidth;
    setProgress(max > 0 ? Math.round((node.scrollLeft / max) * 100) : 0);
  };
  if (!items.length)
    return (
      <div className="empty-state priority-empty">
        <p>暂无达到重大信号门槛的情报</p>
        <small>需满足重要度、可信度和原文证据要求。</small>
      </div>
    );
  return (
    <div className="carousel-shell">
      {items.length > 3 ? (
        <button
          className="carousel-arrow previous"
          aria-label="查看上一组优先信号"
          disabled={progress <= 1}
          onClick={() => move(-1)}
        >
          <ArrowLeft size={18} />
        </button>
      ) : null}
      <div className="priority-carousel" ref={rail} onScroll={syncProgress}>
        {items.map((item) => (
          <button className="highlight-card" key={item.id} onClick={() => onSelect(item)}>
            <div className="highlight-top">
              <span className={`priority-badge ${item.importance}`}>
                {item.importance === "critical" ? "重大" : "重要"}
              </span>
              <span>评分 {Math.round(priorityScore(item))}</span>
            </div>
            <h3>{item.title}</h3>
            <p>{item.summary}</p>
            <div className="highlight-proof">
              <ShieldCheck size={13} />可信度 {Math.round(item.confidence * 100)}% · {dedupeEvidence(item.evidence).length} 条原文证据
            </div>
          </button>
        ))}
      </div>
      {items.length > 3 ? (
        <>
          <button
            className="carousel-arrow next"
            aria-label="查看下一组优先信号"
            disabled={progress >= 99}
            onClick={() => move(1)}
          >
            <ArrowRight size={18} />
          </button>
          <div className="carousel-progress" aria-hidden="true">
            <i style={{ width: `${Math.max(12, progress)}%` }} />
          </div>
          <span className="carousel-count">共 {items.length} 条</span>
        </>
      ) : null}
    </div>
  );
}
