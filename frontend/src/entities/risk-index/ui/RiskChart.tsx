"use client";

import { useMemo, useState } from "react";
import { formatScore, GRADE_STYLE, HIGH_RISK, TENSION } from "@/shared/lib";
import type { IndexPoint } from "../model/types";

const W = 1000;
const H = 280;
const PAD = { top: 16, right: 12, bottom: 24, left: 36 };
const Y_MIN = -25;
const Y_MAX_FLOOR = 175;
const WAR_GRADE = "전쟁 중";

interface Props {
  points: IndexPoint[];
}

/** 7일 점수(실선)·24시간 점수(흐린 선), 50/100 기준선, 전쟁 기간 음영. 외부 차트 라이브러리 없이 SVG 로 그림. */
export function RiskChart({ points }: Props) {
  const [hover, setHover] = useState<number | null>(null);

  const geo = useMemo(() => {
    const n = points.length;
    const yMax = Math.max(Y_MAX_FLOOR, ...points.map((p) => p.weekly ?? 0));
    const x = (i: number) => PAD.left + (i / Math.max(1, n - 1)) * (W - PAD.left - PAD.right);
    const y = (v: number) => PAD.top + (1 - (v - Y_MIN) / (yMax - Y_MIN)) * (H - PAD.top - PAD.bottom);
    const path = (key: "weekly" | "daily" | "blended") => {
      let d = "";
      let pen = false;
      points.forEach((p, i) => {
        // 종합은 v2 가 있는 날만 (나머지는 v1 과 같아서 겹침)
        const v = key === "blended" && p.v2_weekly == null ? null : p[key];
        if (v == null) return void (pen = false); // 결측(null·필드 없음)은 선을 끊음
        d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(Math.max(Y_MIN, Math.min(yMax, v))).toFixed(1)}`;
        pen = true;
      });
      return d;
    };
    // 전쟁 기간 → 연속 구간 사각형
    const wars: [number, number][] = [];
    points.forEach((p, i) => {
      if (p.grade !== WAR_GRADE) return;
      const last = wars.at(-1);
      if (last && last[1] === i - 1) last[1] = i;
      else wars.push([i, i]);
    });
    const years = points
      .map((p, i) => ({ i, year: p.date.slice(0, 4), first: i === 0 || p.date.slice(0, 4) !== points[i - 1].date.slice(0, 4) }))
      .filter((t) => t.first && t.i > 0);
    // 종합은 v2 가 있는 기간에만 v1 과 달라지므로 그 구간만 그림
    const blended = path("blended");
    const hasV2 = points.some((p) => p.v2_weekly != null);
    return { x, y, weekly: path("weekly"), daily: path("daily"), blended: hasV2 ? blended : "", wars, years, yMax };
  }, [points]);

  if (points.length === 0) return null;
  const hp = hover !== null ? points[hover] : points.at(-1)!;

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((rel - PAD.left) / (W - PAD.left - PAD.right)) * (points.length - 1));
    setHover(Math.max(0, Math.min(points.length - 1, i)));
  };

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs text-neutral-400">
        <span className="font-mono text-neutral-200">{hp.date}</span>
        <span>
          종합 <b className={hp.grade ? GRADE_STYLE[hp.grade].text : ""}>{formatScore(hp.blended ?? hp.weekly)}</b>
        </span>
        <span>일별 집계 {formatScore(hp.weekly)}</span>
        {hp.v2_weekly != null && <span>15분 집계 {formatScore(hp.v2_weekly)}</span>}
        <span>24시간 {formatScore(hp.daily)}</span>
        {hp.grade && <span>{hp.grade}</span>}
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-64 w-full touch-none select-none"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        role="img"
        aria-label="전쟁 가능성 지수 추이"
      >
        {geo.wars.map(([a, b]) => (
          <rect key={a} x={geo.x(a)} y={PAD.top} width={Math.max(2, geo.x(b) - geo.x(a))}
            height={H - PAD.top - PAD.bottom} fill="#e879f9" opacity={0.12} />
        ))}
        {[0, TENSION, HIGH_RISK, 150].filter((v) => v <= geo.yMax).map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={geo.y(v)} y2={geo.y(v)}
              stroke={v === HIGH_RISK ? "#f87171" : "#ffffff"} strokeOpacity={v === HIGH_RISK ? 0.6 : 0.08}
              strokeDasharray={v === HIGH_RISK ? "6 4" : undefined} />
            <text x={PAD.left - 6} y={geo.y(v) + 4} textAnchor="end" className="fill-neutral-400 text-[11px]">{v}</text>
          </g>
        ))}
        {geo.years.map((t) => (
          <text key={t.i} x={geo.x(t.i)} y={H - 6} textAnchor="middle" className="fill-neutral-400 text-[11px]">{t.year}</text>
        ))}
        {/* key 가 바뀌면(데이터·기간 변경) 선을 처음부터 다시 그림 */}
        <path key={`d-${geo.daily.length}`} d={geo.daily} fill="none" stroke="#94a3b8" strokeOpacity={0.25}
          strokeWidth={1} pathLength={1} strokeDasharray="1" className="animate-draw" />
        <path key={`w-${geo.weekly.length}`} d={geo.weekly} fill="none" stroke="#60a5fa" strokeWidth={1.6}
          pathLength={1} strokeDasharray="1" className="animate-draw" />
        {geo.blended && (
          <path key={`b-${geo.blended.length}`} d={geo.blended} fill="none" stroke="#fbbf24" strokeWidth={1.8}
            pathLength={1} strokeDasharray="1" className="animate-draw" />
        )}
        {hover !== null && (
          <line x1={geo.x(hover)} x2={geo.x(hover)} y1={PAD.top} y2={H - PAD.bottom} stroke="#fff" strokeOpacity={0.3} />
        )}
      </svg>
      <div className="mt-2 flex flex-wrap gap-4 text-[11px] text-neutral-400">
        <span><i className="mr-1 inline-block h-0.5 w-4 bg-blue-400 align-middle" />일별 뉴스 집계 7일</span>
        <span><i className="mr-1 inline-block h-0.5 w-4 bg-amber-400 align-middle" />종합 (일별+15분 집계, 최근 1년)</span>
        <span><i className="mr-1 inline-block h-0.5 w-4 bg-slate-400/40 align-middle" />24시간 점수</span>
        <span><i className="mr-1 inline-block h-0.5 w-4 border-t border-dashed border-red-400 align-middle" />100 = 평시 대비 +2σ</span>
        <span><i className="mr-1 inline-block h-2.5 w-3 bg-fuchsia-400/30 align-middle" />전쟁 기간</span>
      </div>
    </div>
  );
}
