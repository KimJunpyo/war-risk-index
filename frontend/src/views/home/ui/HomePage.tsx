"use client";

import { useState } from "react";
import { Opponents, StatusBadge, useCountries, type Advisory, type Country } from "@/entities/country";
import { ActionGuide, FAQ } from "@/entities/guide";
import { LiveBadge } from "@/entities/live";
import { GradeBadge, usePairs, type Pair } from "@/entities/pair";
import { useBlendWeights } from "@/entities/risk-index";
import { PairTabs } from "@/features/select-pair";
import { countryName, formatScore, GRADE_STYLE, newsKeywords, type Grade, type LiveScore } from "@/shared/lib";
import { AnimatedNumber, StatusText } from "@/shared/ui";
import { CatalystPanel } from "@/widgets/catalyst-panel";
import { GuideModal } from "@/widgets/guide-modal";
import { NewsFeed } from "@/widgets/news-feed";
import { PastCases } from "@/widgets/past-cases";
import { RiskHistory } from "@/widgets/risk-history";
import { WeeklyMovers } from "@/widgets/weekly-movers";
import { WorldMap } from "@/widgets/world-map";

// 첫 접속 시 기본으로 보여줄 나라 (GDELT/CAMEO 코드)
const DEFAULT_COUNTRY = "KOR";

// 국가는 code 로 들고 있다가 매번 최신 목록에서 찾음 (5분마다 실시간 점수 갱신)
type Target = { kind: "pair"; id: string } | { kind: "country"; code: string };

interface Summary {
  title: string;
  basePath: string;
  newsPath: string;
  newsKeywords: string[]; // 뉴스 제목 필터 키워드
  blended: number | null | undefined; // 종합
  daily7: number | null | undefined; // 일별 뉴스 집계(GDELT 1.0) 7일
  min15: number | null | undefined; // 15분 뉴스 집계(GDELT 2.0) 7일
  reason: string | null; // 상태 근거
  grade: Grade | null | undefined;
  live: LiveScore | null | undefined;
  status: Country["status"];
  date: string | undefined;
  advisory: Advisory[]; // 정부 여행경보 (국가만)
  country: Country | null;
}

export function HomePage() {
  const pairs = usePairs();
  const countries = useCountries();
  const [picked, setPicked] = useState<Target | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const target = picked ?? defaultTarget(countries.data, pairs.data);
  const summary = target && summarize(target, pairs.data ?? [], countries.data ?? []);
  const weights = useBlendWeights().data;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-6 animate-fade-up">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-white">전쟁 가능성 지수</h1>
          <LiveBadge />
          <button
            onClick={() => setGuideOpen(true)}
            className="ml-auto rounded-full border border-white/15 px-3 py-1 text-xs text-neutral-300 transition hover:bg-white/10"
          >
            가이드 · 여행경보 단계
          </button>
        </div>
        <p className="mt-1 text-sm text-neutral-400">
          나라·국가 쌍의 갈등 뉴스가 평소 대비 얼마나 튀었는지를 점수화합니다. 100점 = 평시 대비 +2σ.
          높은 점수는 위험이 크다는 뜻이며 개전 예측이 아닙니다.
        </p>
      </header>
      <GuideModal open={guideOpen} onClose={() => setGuideOpen(false)} />

      <StatusText loading={countries.loading} error={countries.error} />
      {countries.data && countries.data.length > 0 && (
        <>
          <WorldMap
            countries={countries.data}
            selected={target?.kind === "country" ? target.code : null}
            onSelect={(c) => setPicked({ kind: "country", code: c.code })}
          />
          <WeeklyMovers countries={countries.data} onSelect={(c) => setPicked({ kind: "country", code: c.code })} />
        </>
      )}

      <h2 className="mb-3 mt-8 text-sm font-semibold tracking-wide text-neutral-300">주요 분쟁 쌍</h2>
      <StatusText loading={pairs.loading} error={pairs.error} />
      {pairs.data && (
        <PairTabs
          pairs={pairs.data}
          selected={target?.kind === "pair" ? target.id : null}
          onSelect={(id) => setPicked({ kind: "pair", id })}
        />
      )}

      {summary && (
        // key: 대상이 바뀌면 패널 애니메이션을 다시 재생
        <section key={summary.basePath} className="mt-8">
          <div className="mb-4 flex flex-wrap items-end gap-x-6 gap-y-2 animate-fade-up">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold text-white">{summary.title}</h2>
                {summary.status ? <StatusBadge status={summary.status} /> : <GradeBadge grade={summary.grade ?? null} />}
              </div>
              <p className="text-xs text-neutral-500">
                기준일 {summary.date ?? "–"}{summary.reason && <> · {summary.reason}</>}
              </p>
              {summary.country && <Opponents country={summary.country} className="text-xs text-neutral-400" />}
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-xs text-neutral-500">종합 7일</span>
              <AnimatedNumber
                value={summary.blended ?? summary.daily7}
                className={`text-4xl font-semibold tabular-nums ${summary.grade ? GRADE_STYLE[summary.grade].text : "text-neutral-300"}`}
              />
            </div>
            {summary.live && (
              <div className="flex items-baseline gap-2">
                <span className="text-xs text-neutral-500">실시간 24시간</span>
                <AnimatedNumber value={summary.live.score} className="text-2xl font-semibold tabular-nums text-neutral-200" />
              </div>
            )}
            <p className="w-full text-[11px] text-neutral-500">
              종합 점수 구성: 일별 뉴스 집계 {formatScore(summary.daily7)} · 15분 뉴스 집계 {formatScore(summary.min15)}
              {weights && (
                <> (결합 비율 {Math.round(weights.w1 * 100)} : {Math.round(weights.w2 * 100)}
                  {weights.estimated
                    ? ` · 두 집계의 흔들림 크기로 추정, ${weights.entities}개국·상관 ${weights.median_corr})`
                    : " · 임시값)"}</>
              )}
            </p>
            {summary.advisory.length > 0 && (
              <p className="w-full text-[11px] text-neutral-500">
                여행경보(점수 미반영){summary.advisory.map((a) => (
                  <span key={a.source}> · {a.url ? <a href={a.url} target="_blank" rel="noreferrer" className="underline decoration-neutral-700 hover:text-neutral-300">{a.name}</a> : a.name}{" "}
                    <b className={a.level >= a.max_level ? "text-rose-300" : "text-neutral-300"}>{a.level}/{a.max_level}단계</b>
                    {" "}({a.label}, {a.date ?? "날짜 없음"})</span>
                ))}
                {" "}<button onClick={() => setGuideOpen(true)} className="underline decoration-neutral-700 hover:text-neutral-300">단계 설명</button>
              </p>
            )}
            <ActionGuide score={summary.blended ?? summary.daily7} status={summary.status} onMore={() => setGuideOpen(true)} />
          </div>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <RiskHistory basePath={summary.basePath} />
            <NewsFeed newsPath={summary.newsPath} keywords={summary.newsKeywords} />
            {/* 패널이 3개라 2열 그리드 마지막 칸이 비지 않도록 두 열을 모두 차지 */}
            <div className="lg:col-span-2">
              <CatalystPanel basePath={summary.basePath} />
            </div>
            {/* 국가 쌍만 (국가 단위 비교는 범위 밖). 같은 기준인 일별 뉴스 집계 7일 값이 없으면 숨김 */}
            {target?.kind === "pair" && summary.daily7 != null && (
              <PastCases pairId={target.id} pairName={summary.title} current={summary.daily7} />
            )}
          </div>
        </section>
      )}

      <section className="mt-10" aria-labelledby="faq-title">
        <h2 id="faq-title" className="mb-3 text-sm font-semibold tracking-wide text-neutral-300">자주 묻는 질문</h2>
        <div className="divide-y divide-white/5 rounded-xl border border-white/10">
          {FAQ.map(({ q, a }) => (
            <details key={q} className="group px-4 py-3">
              <summary className="cursor-pointer select-none text-sm text-neutral-200">{q}</summary>
              <p className="mt-2 text-xs leading-relaxed text-neutral-400">{a}</p>
            </details>
          ))}
        </div>
      </section>

      <footer className="mt-10 text-xs leading-relaxed text-neutral-600">
        데이터: GDELT 일별 파일(일별 뉴스 집계·과거 추이), GDELT 15분 파일(15분 뉴스 집계·실시간 24시간),
        UCDP GED(전쟁·내전·무력 충돌 판정, 약 1개월 지연), 미 국무부·영국 FCDO(여행경보), Google News(뉴스).
        종합 = 두 뉴스 집계의 7일 점수를 흔들림이 작은 쪽에 더 무게를 둬 합친 값. 공식: FORMULA_v1.md.
      </footer>
    </main>
  );
}

/** 첫 화면: 한국이 있으면 한국, 없으면 첫 국가 쌍 */
function defaultTarget(countries: Country[] | undefined, pairs: Pair[] | undefined): Target | null {
  if (countries?.some((c) => c.code === DEFAULT_COUNTRY)) return { kind: "country", code: DEFAULT_COUNTRY };
  if (!countries) return null; // 국가 목록이 오기 전에는 기다림 (쌍으로 잠깐 바뀌는 깜빡임 방지)
  return pairs?.[0] ? { kind: "pair", id: pairs[0].id } : null;
}

function summarize(target: Target, pairs: Pair[], countries: Country[]): Summary | null {
  if (target.kind === "country") {
    const c = countries.find((x) => x.code === target.code);
    if (!c) return null;
    const name = countryName(c.iso2, c.code);
    const basePath = `/api/countries/${c.code}`;
    return {
      title: name, basePath, newsPath: `${basePath}/news?name=${encodeURIComponent(name)}`, newsKeywords: newsKeywords(c.iso2),
      blended: c.latest.blended, daily7: c.latest.weekly, min15: c.latest.v2_weekly, reason: c.status_reason,
      grade: c.latest.grade, live: c.live, status: c.status, date: c.latest.date, advisory: c.advisory ?? [], country: c,
    };
  }
  const p = pairs.find((x) => x.id === target.id);
  if (!p) return null;
  const basePath = `/api/pairs/${p.id}`;
  // 쌍 id(KOR-PRK)의 각 코드를 국가 목록에서 찾아 두 나라 키워드 합집합 (목록에 없는 나라는 p.countries 한국어 이름만)
  const keywords = p.id.split("-").flatMap((code) => {
    const c = countries.find((x) => x.code === code);
    return c ? newsKeywords(c.iso2) : [];
  });
  return {
    title: p.name, basePath, newsPath: `${basePath}/news`, newsKeywords: [...new Set([...keywords, ...p.countries])],
    blended: p.latest?.blended, daily7: p.latest?.weekly, min15: p.latest?.v2_weekly, reason: null,
    grade: p.latest?.grade, live: p.live, status: null, date: p.latest?.date, advisory: [], country: null,
  };
}
