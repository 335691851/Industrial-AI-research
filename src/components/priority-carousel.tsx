"use client";
import { useRef } from "react";
import { ArrowLeft, ArrowRight, ShieldCheck } from "lucide-react";
import { Item, priorityScore } from "@/lib/domain";

export function PriorityCarousel({ items, onSelect }: { items: Item[]; onSelect: (item: Item) => void }) {
  const rail = useRef<HTMLDivElement>(null);
  const scroll = (direction: number) => rail.current?.scrollBy({ left: direction * Math.max(320, rail.current.clientWidth * 0.8), behavior: "smooth" });
  if (!items.length) return <div className="empty-state"><p>暂无达到重大信号门槛的情报</p><small>需满足重要度、可信度和原文证据要求。</small></div>;
  return <>
    {items.length > 3 && <div className="carousel-controls"><span>共 {items.length} 条高可信信号</span><button aria-label="上一组" onClick={() => scroll(-1)}><ArrowLeft size={15} /></button><button aria-label="下一组" onClick={() => scroll(1)}><ArrowRight size={15} /></button></div>}
    <div className="priority-carousel" ref={rail}>
      {items.map((item) => <button className="highlight-card" key={item.id} onClick={() => onSelect(item)}>
        <div className="highlight-top"><span className={`priority-badge ${item.importance}`}>{item.importance === "critical" ? "重大" : "重要"}</span><span>评分 {Math.round(priorityScore(item))}</span></div>
        <h3>{item.title}</h3><p>{item.summary}</p>
        <div className="highlight-proof"><ShieldCheck size={13} />可信度 {Math.round(item.confidence * 100)}% · {item.evidence.length} 条原文证据</div>
      </button>)}
    </div>
  </>;
}
