"use client";

import { useEffect, useRef } from "react";
import { STATUS_STYLE, WATCH_CRITERIA } from "@/entities/country";
import { ADVISORY_LEVELS, CHECKLIST_SOURCE, SCORE_BANDS, type AdvisoryName } from "@/entities/guide";
import { ScrollArea } from "@/shared/ui";

const STATUS_KEYS = Object.keys(STATUS_STYLE) as (keyof typeof STATUS_STYLE)[];

// 여행경보 표 열·카드 목록 순서
const AGENCIES = [
  { key: "kr", label: "외교부" },
  { key: "us", label: "미 국무부" },
  { key: "uk", label: "영국 FCDO (자체 환산)" },
] as const;

/** 단계 이름: 주 문구는 한 줄 고정, 보조 문구는 둘째 줄 작은 글씨(어절 단위 줄바꿈) */
function AdvisoryNameText({ name }: { name: AdvisoryName }) {
  return (
    <>
      <span className="whitespace-nowrap">{name.main}</span>
      {name.sub && <span className="block break-keep text-[11px] text-neutral-400">{name.sub}</span>}
    </>
  );
}

/** 점수 의미·점수별 권고·여행경보 4단계·상태 정의를 담은 가이드 (브라우저 기본 dialog: Esc·포커스 가둠 내장) */
export function GuideModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      // 바깥(배경) 클릭 시 닫기
      onClick={(e) => e.target === e.currentTarget && onClose()}
      aria-labelledby="guide-title"
      // 닫기 줄은 고정, 아래 본문만 스크롤 → thumb가 닫기 줄과 겹치지 않음 (open: 이 없으면 닫힌 dialog 도 보임)
      // md 미만은 화면 전체(브라우저 기본 dialog max-w·max-h 해제), md 720px·lg 760px·xl 880px
      // md 이상 높이는 내용만큼(h-fit = 브라우저 기본값). h-auto 면 modal dialog 가 85vh 로 늘어나 빈 영역(누르면 닫힘)이 생김
      className="m-0 h-dvh max-h-none w-screen max-w-none overflow-hidden open:flex open:flex-col rounded-none border-0 bg-neutral-950 p-0 text-neutral-200 shadow-2xl backdrop:bg-black/70 backdrop:backdrop-blur-sm md:m-auto md:h-fit md:max-h-[85vh] md:w-[min(720px,calc(100vw-48px))] md:rounded-2xl md:border md:border-white/10 lg:w-[760px] xl:w-[880px]"
    >
      <div className="flex shrink-0 items-center justify-between border-b border-white/10 bg-neutral-950/95 px-4 py-4 md:px-6 backdrop-blur">
        <h2 id="guide-title" className="text-lg font-semibold text-white">가이드</h2>
        <button onClick={onClose} aria-label="닫기" className="rounded-md px-2 py-1 text-neutral-400 hover:bg-white/10 hover:text-white">✕</button>
      </div>

      <ScrollArea className="flex min-h-0 flex-col" viewportClassName="min-h-0" label="가이드 본문">
        <div className="space-y-8 px-4 py-5 text-sm md:px-6 leading-relaxed">
          <section>
            <h3 className="mb-2 font-semibold text-white">점수의 의미</h3>
            <p className="text-neutral-400">
              그 나라의 갈등 뉴스가 평소보다 얼마나 튀었는지를 나타냅니다. 50점 = 평소, 100점 = 평소 대비 +2σ(상위 약 2%).
              높은 점수는 위험이 크다는 뜻이며 전쟁을 예측하는 값이 아닙니다.
            </p>
          </section>

          <section>
            <h3 className="mb-2 font-semibold text-white">점수별 행동 권고</h3>
            <div className="space-y-3">
              {SCORE_BANDS.map((b) => (
                <div key={b.id} className="rounded-xl border border-white/10 p-3">
                  <div className="mb-1 flex items-baseline gap-2">
                    <span className={`font-semibold ${b.tone}`}>{b.title}</span>
                    <span className="text-xs text-neutral-400">{b.range}</span>
                  </div>
                  <ul className="list-disc space-y-0.5 pl-5 text-xs text-neutral-300">
                    {b.items.map((it) => <li key={it.id}>{it.text}</li>)}
                  </ul>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-neutral-400">
              일반적인 비상 대비 권고를 참고해 자체 작성한 실험용 가이드입니다(참고:{" "}
              <a href={CHECKLIST_SOURCE.url} target="_blank" rel="noreferrer" className="underline decoration-neutral-700 hover:text-neutral-300">
                {CHECKLIST_SOURCE.name}
              </a>
              ). 정부·민방위·외교부의 공식 경보가 항상 우선합니다.
            </p>
          </section>

          <section data-guide="advisory">
            <h3 className="mb-2 font-semibold text-white">여행경보 4단계</h3>
            {/* md 이상: 표. 단계·주 문구는 한 줄, 남는 폭은 의미 열이 쓴다.
                "N단계"는 텍스트 노드 하나로(JSX {l.level}단계 는 노드 둘이라 Chrome 이 한 줄인데도 getClientRects() 2) */}
            <table className="hidden w-full text-left text-xs md:table">
              <thead className="text-neutral-400">
                <tr>
                  <th className="whitespace-nowrap py-1 pr-3">단계</th>
                  {AGENCIES.map((a) => <th key={a.key} className="break-keep py-1 pr-3">{a.label}</th>)}
                  <th className="py-1">의미</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-neutral-300">
                {ADVISORY_LEVELS.map((l) => (
                  <tr key={l.level} className="align-top">
                    <td className={`py-1.5 pr-3 font-semibold ${l.level === 4 ? "text-rose-300" : ""}`}><span className="whitespace-nowrap">{`${l.level}단계`}</span></td>
                    {AGENCIES.map((a) => <td key={a.key} className="py-1.5 pr-3"><AdvisoryNameText name={l[a.key]} /></td>)}
                    <td className="break-keep py-1.5 text-neutral-400">{l.meaning}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* md 미만: 같은 데이터로 단계별 카드 */}
            <ul className="space-y-3 text-xs md:hidden">
              {ADVISORY_LEVELS.map((l) => (
                <li key={l.level} className="rounded-xl border border-white/10 p-3">
                  <h4 className={`mb-2 font-semibold ${l.level === 4 ? "text-rose-300" : "text-white"}`}><span className="whitespace-nowrap">{`${l.level}단계`}</span></h4>
                  <dl className="space-y-1.5 text-neutral-300">
                    {AGENCIES.map((a) => (
                      <div key={a.key} className="flex gap-3">
                        <dt className="w-20 shrink-0 break-keep text-neutral-400">{a.label}</dt>
                        <dd className="min-w-0"><AdvisoryNameText name={l[a.key]} /></dd>
                      </div>
                    ))}
                  </dl>
                  <p className="mt-2 break-keep text-neutral-400">{l.meaning}</p>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-neutral-400">
              영국 FCDO는 공식 숫자 단계가 없어 권고 범위(일부 지역·전역, 필수 외·모든 여행)를 1~4로 환산했습니다. 외교부 특별여행주의보는 이 표에 없습니다. 여행경보는 점수에 반영하지 않습니다.
            </p>
          </section>

          <section>
            <h3 className="mb-2 font-semibold text-white">지도 상태</h3>
            <ul className="space-y-1 text-xs">
              {STATUS_KEYS.map((s) => (
                <li key={s} className="flex gap-2">
                  <i className="mt-1 inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: STATUS_STYLE[s].hex }} />
                  <span><b className="text-neutral-200">{s}</b> · <span className="text-neutral-400">{WATCH_CRITERIA[s]}</span></span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </ScrollArea>
    </dialog>
  );
}
