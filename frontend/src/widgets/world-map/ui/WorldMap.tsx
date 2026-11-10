"use client";

import { geoArea, geoCentroid, geoGraticule10, geoNaturalEarth1, geoPath } from "d3-geo";
import { select } from "d3-selection";
import { zoom, zoomIdentity, type ZoomBehavior } from "d3-zoom";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import { useEffect, useMemo, useRef, useState } from "react";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import world from "world-atlas/countries-50m.json";
import {
  Opponents, STATUS_STYLE, StatusBadge, WATCH_CRITERIA, WATCH_REASONS, watchList, type Country,
} from "@/entities/country";
import { countryName, formatScore, iso2FromNumeric } from "@/shared/lib";
import { Panel, ScrollArea, SegmentedControl } from "@/shared/ui";

const W = 960;
const H = 500;
const MARGIN = 6;
const MAX_ZOOM = 12;
const ZOOM_STEP = 1.6;
const FLY_MS = 700;
const FLY_MAX_ZOOM = 5;
const FLY_FILL = 0.6; // 날아간 뒤 나라가 화면에서 차지하는 비율
const LABEL_FONT = 10;
const LABEL_CHAR_W = 9; // 한글 한 글자 폭(지도 좌표). 나라 폭에 이름이 들어가면 표시 → 확대할수록 작은 나라도 나타남
const POINTER_R = { "전쟁 중": 4.5, "내전 중": 4, "무력 충돌": 3.5, "휴전·소강": 3, "잦은 국방 이슈": 3 } as const;
const TOOLTIP_W = 220;
// 지도 + 주목 국가 배치(plan.md 5-2). Tailwind 가 소스에서 클래스를 찾으므로 숫자는 클래스 문자열째 상수로 둔다
const MAP_GRID = "lg:grid-cols-[minmax(0,1fr)_260px] xl:grid-cols-[minmax(0,1fr)_300px]"; // 오른쪽 목록 폭 lg 260px, xl 300px
const WATCH_MAX_H = "max-h-[320px] lg:max-h-none"; // lg 미만 목록 최대 높이(lg 이상은 지도 높이에 맞춤)
const CRITERIA_MAX_H = "lg:max-h-32"; // lg 이상 "주목 국가 기준" 최대 높이(128px). 펼쳐도 목록이 남고 영역 밖으로 안 넘침, lg 미만은 다 펼침
// 나라 면에 빗금을 덧씌우는 상태 → SVG 패턴 id
const HATCH_ID = { "전쟁 중": "war-hatch", "내전 중": "civil-hatch" } as const;
const NO_DATA = "#1b2433";
// 점수 → 색 (연속). 50 = 평시, 100 = +2σ
const COLOR_STOPS: [number, [number, number, number]][] = [
  [-25, [16, 64, 60]], [25, [31, 110, 88]], [50, [176, 140, 46]], [100, [226, 84, 61]], [150, [255, 45, 85]],
];
// 지도 데이터에 ISO 숫자 코드가 없는 지역
const UNCODED_NAMES: Record<string, string> = {
  Somaliland: "소말릴란드", Kosovo: "코소보", "N. Cyprus": "북키프로스",
  "Indian Ocean Ter.": "인도양 지역(호주령)", "Siachen Glacier": "시아첸 빙하",
};
const ZOOM_BUTTONS = [
  { label: "+", aria: "확대", factor: ZOOM_STEP },
  { label: "−", aria: "축소", factor: 1 / ZOOM_STEP },
  { label: "⟲", aria: "처음 위치로", factor: null }, // null = 초기화
];

type Metric = "blended" | "live";
const METRICS: { value: Metric; label: string }[] = [
  { value: "blended", label: "종합" },
  { value: "live", label: "실시간 24시간" },
];
// 지도 색·주목 국가 점수·정렬이 모두 이 기준을 따름
const METRIC_SCORE: Record<Metric, (c: Country) => number | null | undefined> = {
  blended: (c) => c.latest.blended ?? c.latest.weekly,
  live: (c) => c.live?.score,
};

// 지도 도형은 모듈 로드 시 한 번만 투영 (50m 해상도, 241개 지역)
const topo = world as unknown as Topology<{ countries: GeometryCollection<{ name: string }> }>;
const projection = geoNaturalEarth1().fitExtent([[MARGIN, MARGIN], [W - MARGIN, H - MARGIN]], { type: "Sphere" });
const toPath = geoPath(projection);

/** 해외 영토가 있는 나라(프랑스 등)는 가장 큰 땅덩이 기준으로 중심·범위를 잡음 */
function mainPart(f: Feature<Polygon | MultiPolygon>): Polygon {
  const g = f.geometry;
  return g.type === "MultiPolygon"
    ? g.coordinates.map((c) => ({ type: "Polygon" as const, coordinates: c }))
      .reduce((a, b) => (geoArea(b) > geoArea(a) ? b : a))
    : g;
}

const SHAPES = feature(topo, topo.objects.countries).features.map((f, i) => {
  const main = mainPart(f as Feature<Polygon | MultiPolygon>);
  const id = f.id === undefined ? "" : String(f.id);
  return {
    id,
    key: `${id}-${i}`, // 50m 지도는 같은 숫자 코드를 쓰는 부속 지역이 있음(예: 호주 036)
    area: geoArea(f),
    name: countryName(iso2FromNumeric(id), UNCODED_NAMES[f.properties.name] ?? f.properties.name),
    d: toPath(f) ?? "",
    center: projection(geoCentroid(main)),
    bounds: toPath.bounds(main),
  };
});
// 같은 코드가 여럿이면 가장 큰 땅(본토)을 대표로: 면적 오름차순으로 넣어 큰 것이 덮어씀
const SHAPE_BY_ID = new Map(SHAPES.filter((s) => s.id).sort((a, b) => a.area - b.area).map((s) => [s.id, s]));
// 이름표: 나라마다 하나(본토 기준), 나라 폭과 이름 길이를 미리 계산
const LABELS = [...SHAPE_BY_ID.values()].filter((s) => s.center).map((s) => ({
  ...s, width: s.bounds[1][0] - s.bounds[0][0], textW: s.name.length * LABEL_CHAR_W,
}));
const SPHERE = toPath({ type: "Sphere" }) ?? "";
const GRATICULE = toPath(geoGraticule10()) ?? "";

function scoreColor(score: number | null | undefined): string {
  if (score === null || score === undefined) return NO_DATA;
  const v = Math.max(COLOR_STOPS[0][0], Math.min(COLOR_STOPS.at(-1)![0], score));
  const i = Math.max(0, COLOR_STOPS.findIndex(([s]) => s >= v) - 1);
  const [s0, c0] = COLOR_STOPS[i];
  const [s1, c1] = COLOR_STOPS[Math.min(i + 1, COLOR_STOPS.length - 1)];
  const t = s1 === s0 ? 0 : (v - s0) / (s1 - s0);
  return `rgb(${c0.map((c, k) => Math.round(c + (c1[k] - c) * t)).join(",")})`;
}
const LEGEND_GRADIENT = `linear-gradient(90deg, ${COLOR_STOPS.map(([s]) => `${scoreColor(s)} ${((s + 25) / 175) * 100}%`).join(",")})`;

interface Props {
  countries: Country[];
  selected: string | null; // 선택된 국가 code
  onSelect: (c: Country) => void;
}

/** 드래그·휠로 움직이는 세계 지도. 국가 색 = 점수, 빗금 = 전쟁·내전, 포인터 = 상태 */
export function WorldMap({ countries, selected, onSelect }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const flyRef = useRef(0);
  const [t, setT] = useState({ k: 1, x: 0, y: 0 });
  const [metric, setMetric] = useState<Metric>("blended");
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);

  const byNumeric = useMemo(() => new Map(countries.map((c) => [c.numeric, c])), [countries]);
  const watch = useMemo(() => watchList(countries, METRIC_SCORE[metric]), [countries, metric]);
  const flagged = useMemo(() => countries.filter((c) => c.status && SHAPE_BY_ID.get(c.numeric)?.center), [countries]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const z = zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, MAX_ZOOM])
      .translateExtent([[0, 0], [W, H]])
      .on("start", () => cancelAnimationFrame(flyRef.current)) // 사용자가 잡으면 비행 중단
      .on("zoom", (e) => setT({ k: e.transform.k, x: e.transform.x, y: e.transform.y }));
    zoomRef.current = z;
    const sel = select(svg).call(z).on("dblclick.zoom", null);
    return () => {
      cancelAnimationFrame(flyRef.current);
      sel.on(".zoom", null);
    };
  }, []);

  const apply = (k: number, x: number, y: number) =>
    svgRef.current && zoomRef.current?.transform(select(svgRef.current), zoomIdentity.translate(x, y).scale(k));
  const zoomBy = (f: number) => svgRef.current && zoomRef.current?.scaleBy(select(svgRef.current), f);

  /** 현재 위치에서 목표까지 부드럽게 이동 (d3-transition 없이 requestAnimationFrame 으로) */
  const flyTo = (target: { k: number; x: number; y: number }) => {
    cancelAnimationFrame(flyRef.current);
    const from = t;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let start: number | null = null; // 첫 프레임 시각
    const step = (now: number) => {
      start ??= now;
      const p = reduce ? 1 : Math.min(1, (now - start) / FLY_MS);
      const e = p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2;
      apply(from.k + (target.k - from.k) * e, from.x + (target.x - from.x) * e, from.y + (target.y - from.y) * e);
      if (p < 1) flyRef.current = requestAnimationFrame(step);
    };
    flyRef.current = requestAnimationFrame(step);
  };

  const flyToCountry = (c: Country) => {
    const s = SHAPE_BY_ID.get(c.numeric);
    if (!s) return;
    const [[x0, y0], [x1, y1]] = s.bounds;
    const k = Math.min(FLY_MAX_ZOOM, FLY_FILL / Math.max((x1 - x0) / W, (y1 - y0) / H));
    flyTo({ k, x: W / 2 - k * (x0 + x1) / 2, y: H / 2 - k * (y0 + y1) / 2 });
  };

  const pick = (c: Country, fly: boolean) => {
    onSelect(c);
    if (fly) flyToCountry(c);
  };

  // 나라 면은 확대·호버와 무관 → 메모해서 이동 중 다시 그리지 않음
  const land = useMemo(() => SHAPES.map((s) => {
    const c = byNumeric.get(s.id);
    const v = c && METRIC_SCORE[metric](c);
    return (
      <g key={s.key}>
        <path
          d={s.d}
          fill={scoreColor(v)}
          stroke="#0a0f18"
          strokeWidth={0.4}
          vectorEffect="non-scaling-stroke"
          className={`transition-[fill] duration-700 ${c ? "cursor-pointer" : ""}`}
          onMouseMove={(e) => {
            const r = boxRef.current?.getBoundingClientRect();
            if (r) setHover({ id: s.key, x: Math.min(e.clientX - r.left + 14, r.width - TOOLTIP_W), y: e.clientY - r.top + 14 });
          }}
          onClick={() => c && pick(c, false)}
        />
        {c?.status && c.status in HATCH_ID && (
          <path d={s.d} fill={`url(#${HATCH_ID[c.status as keyof typeof HATCH_ID]})`} className="pointer-events-none" />
        )}
      </g>
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps -- pick 은 onSelect 만 바뀌면 됨
  }), [byNumeric, metric, onSelect]);

  const hovered = hover ? SHAPES.find((s) => s.key === hover.id) : null;
  const hc = hovered ? byNumeric.get(hovered.id) : undefined;
  const sel = countries.find((c) => c.code === selected);
  const selShape = sel ? SHAPE_BY_ID.get(sel.numeric) : undefined;

  return (
    <Panel
      title="세계 지도"
      action={<SegmentedControl label="지도 색 기준" value={metric} options={METRICS} onChange={setMetric} />}
    >
      <div className={`grid gap-4 ${MAP_GRID}`}>
        <div ref={boxRef} className="relative overflow-hidden rounded-xl bg-[#05080e] ring-1 ring-white/5">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            className="h-auto w-full cursor-grab touch-none select-none active:cursor-grabbing"
            role="img"
            aria-label="국가별 전쟁 가능성 지수 세계 지도"
            onMouseLeave={() => setHover(null)}
          >
            <defs>
              <radialGradient id="ocean" cx="50%" cy="45%" r="65%">
                <stop offset="0%" stopColor="#0f1e33" />
                <stop offset="100%" stopColor="#060a12" />
              </radialGradient>
              {(Object.keys(HATCH_ID) as (keyof typeof HATCH_ID)[]).map((st) => (
                <pattern key={st} id={HATCH_ID[st]} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <line x1="0" y1="0" x2="0" y2="5" stroke={STATUS_STYLE[st].hex} strokeWidth="1.6" strokeOpacity="0.75" />
                </pattern>
              ))}
              <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="2.5" result="b" />
                <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>
            <g transform={`translate(${t.x},${t.y}) scale(${t.k})`}>
              <path d={SPHERE} fill="url(#ocean)" stroke="#1d3554" strokeWidth={1} vectorEffect="non-scaling-stroke" />
              <path d={GRATICULE} fill="none" stroke="#ffffff" strokeOpacity={0.05} strokeWidth={0.5}
                vectorEffect="non-scaling-stroke" className="pointer-events-none" />
              {land}
              {hovered && hovered !== selShape && (
                <path d={hovered.d} fill="none" stroke="#ffffff" strokeOpacity={0.7} strokeWidth={1}
                  vectorEffect="non-scaling-stroke" className="pointer-events-none" />
              )}
              {selShape && (
                <path d={selShape.d} fill="none" stroke="#ffffff" strokeWidth={1.8} filter="url(#glow)"
                  vectorEffect="non-scaling-stroke" className="pointer-events-none" />
              )}
              {flagged.map((c) => {
                const s = SHAPE_BY_ID.get(c.numeric)!;
                const status = c.status!;
                const hex = STATUS_STYLE[status].hex;
                return (
                  <g key={c.code} transform={`translate(${s.center![0]},${s.center![1]}) scale(${1 / t.k})`}
                    className="pointer-events-none">
                    <circle r={POINTER_R[status]} fill={hex} className="animate-ping-slow"
                      style={{ transformBox: "fill-box", transformOrigin: "center" }} />
                    <circle r={POINTER_R[status]} fill={hex} stroke="#05080e" strokeWidth={1.2} filter="url(#glow)" />
                  </g>
                );
              })}
              {LABELS.map((s) => {
                const c = byNumeric.get(s.id);
                // 화면에서 나라 폭이 이름보다 넓을 때만 (선택한 나라는 항상)
                if (s !== selShape && s.width * t.k < s.textW) return null;
                const r = c?.status ? POINTER_R[c.status] + 4 : 0; // 포인터가 있으면 그 위에
                return (
                  <text key={s.key} transform={`translate(${s.center![0]},${s.center![1]}) scale(${1 / t.k})`}
                    y={r ? -r : LABEL_FONT / 3} textAnchor="middle" fontSize={LABEL_FONT}
                    fill={c ? "#e5e7eb" : "#6b7280"} stroke="#05080e" strokeWidth={3} paintOrder="stroke"
                    className="pointer-events-none font-medium">
                    {s.name}
                  </text>
                );
              })}
            </g>
          </svg>

          {hovered && (
            <div
              className="pointer-events-none absolute z-10 rounded-lg border border-white/10 bg-neutral-900/95 px-3 py-2 text-xs shadow-xl backdrop-blur"
              style={{ left: hover!.x, top: hover!.y, width: TOOLTIP_W - 8 }}
            >
              <div className="mb-1 flex items-center gap-2 font-medium text-neutral-100">
                {hovered.name}
                {hc && <StatusBadge status={hc.status} />}
              </div>
              {hc ? (
                <div className="space-y-0.5 text-neutral-400">
                  <div>종합 <b className="text-neutral-100">{formatScore(hc.latest.blended ?? hc.latest.weekly)}</b></div>
                  <div>실시간 24시간 <b className="text-neutral-100">{formatScore(hc.live?.score)}</b></div>
                  {(hc.ucdp.all_12m ?? 0) > 0 && (
                    <div>UCDP 12개월 사망 <b className="text-neutral-100">{hc.ucdp.all_12m!.toLocaleString()}</b>명</div>
                  )}
                  {hc.advisory?.length > 0 && (
                    <div>여행경보 {hc.advisory.map((a, i) => (
                      <span key={a.source}>{i > 0 && " · "}{a.name} <b className="text-neutral-100">{a.level}</b>/{a.max_level}</span>
                    ))}</div>
                  )}
                  <Opponents country={hc} className="block" />
                  {hc.status_reason && <div className="pt-1 text-[11px] text-neutral-500">{hc.status_reason}</div>}
                </div>
              ) : (
                <div className="text-neutral-500">데이터 없음 (언급량 부족)</div>
              )}
            </div>
          )}

          <div className="absolute bottom-2 right-2 flex flex-col gap-1">
            {ZOOM_BUTTONS.map((b) => (
              <button key={b.aria} aria-label={b.aria} onClick={() => (b.factor ? zoomBy(b.factor) : flyTo({ k: 1, x: 0, y: 0 }))}
                className="h-7 w-7 rounded-md border border-white/10 bg-neutral-900/80 text-sm text-neutral-300 backdrop-blur hover:bg-neutral-800">
                {b.label}
              </button>
            ))}
          </div>
        </div>

        {/* lg 이상: 안쪽을 absolute 로 띄워 목록이 행 높이에 영향을 주지 않게 → 행 높이 = 지도 높이 */}
        <aside className="lg:relative">
          <div className="flex flex-col lg:absolute lg:inset-0">
            <div className="mb-2 flex items-baseline justify-between">
              <h3 className="text-xs font-semibold text-neutral-400">주목 국가</h3>
              <span className="text-[11px] text-neutral-600">{watch.length}개국</span>
            </div>
            <ScrollArea className="lg:min-h-0 lg:flex-1" viewportClassName={`${WATCH_MAX_H} pr-1 lg:h-full`}>
              {/* md~lg 미만에서 2열 */}
              <ul className="grid gap-0.5 md:grid-cols-2 lg:grid-cols-1">
                {watch.map(({ country: c, reasons }, i) => (
                  <li key={c.code} className="animate-fade-up" style={{ animationDelay: `${Math.min(i, 15) * 30}ms` }}>
                    <button
                      onClick={() => pick(c, true)}
                      className={`w-full rounded-lg px-2 py-1.5 text-left transition hover:bg-white/5 ${c.code === selected ? "bg-white/10" : ""}`}
                    >
                      <div className="flex items-center gap-2 text-sm">
                        <span className="truncate text-neutral-200">{countryName(c.iso2, c.code)}</span>
                        <span className="ml-auto tabular-nums text-neutral-300">{formatScore(METRIC_SCORE[metric](c))}</span>
                      </div>
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {reasons.map((r) => (
                          <span key={r} className="rounded bg-white/5 px-1.5 text-[10px] text-neutral-400">{r}</span>
                        ))}
                      </div>
                    </button>
                  </li>
                ))}
                {watch.length === 0 && <li className="text-sm text-neutral-500">없음</li>}
              </ul>
            </ScrollArea>
            <details className="mt-2 text-[11px] text-neutral-500">
              <summary className="cursor-pointer select-none text-neutral-400">주목 국가 기준</summary>
              {/* label: 안에 포커스 받을 요소가 없어 스크롤 영역이 Tab 포커스를 받아야 키보드로 스크롤됨 */}
              <ScrollArea className="mt-1" viewportClassName={`${CRITERIA_MAX_H} lg:pr-1`} label="주목 국가 기준">
                <ul className="space-y-1">
                  {WATCH_REASONS.map((r) => <li key={r}><b className="text-neutral-300">{r}</b> · {WATCH_CRITERIA[r]}</li>)}
                </ul>
              </ScrollArea>
            </details>
          </div>
        </aside>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-neutral-500">
        <span className="flex items-center gap-2">
          점수
          <span className="relative inline-block h-2 w-40 rounded-full" style={{ background: LEGEND_GRADIENT }}>
            {[0, 50, 100, 150].map((v) => (
              <span key={v} className="absolute top-2.5 -translate-x-1/2 text-[10px]" style={{ left: `${((v + 25) / 175) * 100}%` }}>{v}</span>
            ))}
          </span>
        </span>
        {(Object.keys(STATUS_STYLE) as (keyof typeof STATUS_STYLE)[]).map((s) => (
          <span key={s} className="inline-flex items-center gap-1">
            {/* 전쟁·내전은 나라 면 빗금 + 중심 점으로 함께 표시 */}
            {s in HATCH_ID && (
              <i className="inline-block h-2.5 w-3 rounded-sm"
                style={{ background: `repeating-linear-gradient(45deg, ${STATUS_STYLE[s].hex} 0 2px, transparent 2px 5px)` }} />
            )}
            <i className="inline-block h-2 w-2 rounded-full" style={{ background: STATUS_STYLE[s].hex }} />
            {s}{s in HATCH_ID && <span className="text-neutral-600">(빗금+점)</span>}
          </span>
        ))}
        <span className="text-neutral-600">드래그 이동 · 휠 확대 · 목록에서 고르면 해당 나라로 이동</span>
      </div>
    </Panel>
  );
}
