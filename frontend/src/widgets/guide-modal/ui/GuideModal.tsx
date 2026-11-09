"use client";

import { useEffect, useRef } from "react";
import { STATUS_STYLE, WATCH_CRITERIA } from "@/entities/country";
import { ADVISORY_LEVELS, CHECKLIST_SOURCE, SCORE_BANDS } from "@/entities/guide";

const STATUS_KEYS = Object.keys(STATUS_STYLE) as (keyof typeof STATUS_STYLE)[];

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
      className="m-auto max-h-[85vh] w-[min(760px,calc(100vw-32px))] overflow-y-auto rounded-2xl border border-white/10 bg-neutral-950 p-0 text-neutral-200 shadow-2xl backdrop:bg-black/70 backdrop:backdrop-blur-sm"
    >
      <div className="sticky top-0 flex items-center justify-between border-b border-white/10 bg-neutral-950/95 px-6 py-4 backdrop-blur">
        <h2 id="guide-title" className="text-lg font-semibold text-white">가이드</h2>
        <button onClick={onClose} aria-label="닫기" className="rounded-md px-2 py-1 text-neutral-400 hover:bg-white/10 hover:text-white">✕</button>
      </div>

      <div className="space-y-8 px-6 py-5 text-sm leading-relaxed">
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
                  <span className="text-xs text-neutral-500">{b.range}</span>
                </div>
                <ul className="list-disc space-y-0.5 pl-5 text-xs text-neutral-300">
                  {b.items.map((it) => <li key={it.id}>{it.text}</li>)}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-neutral-500">
            일반적인 비상 대비 권고를 참고해 자체 작성한 실험용 가이드입니다(참고:{" "}
            <a href={CHECKLIST_SOURCE.url} target="_blank" rel="noreferrer" className="underline decoration-neutral-700 hover:text-neutral-300">
              {CHECKLIST_SOURCE.name}
            </a>
            ). 정부·민방위·외교부의 공식 경보가 항상 우선합니다.
          </p>
        </section>

        <section>
          <h3 className="mb-2 font-semibold text-white">여행경보 4단계</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-neutral-500">
                <tr><th className="py-1 pr-3">단계</th><th className="py-1 pr-3">외교부</th><th className="py-1 pr-3">미 국무부</th><th className="py-1 pr-3">영국 FCDO (자체 환산)</th><th className="py-1">의미</th></tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-neutral-300">
                {ADVISORY_LEVELS.map((l) => (
                  <tr key={l.level}>
                    <td className={`py-1.5 pr-3 font-semibold ${l.level === 4 ? "text-rose-300" : ""}`}>{l.level}단계</td>
                    <td className="py-1.5 pr-3">{l.kr}</td>
                    <td className="py-1.5 pr-3">{l.us}</td>
                    <td className="py-1.5 pr-3">{l.uk}</td>
                    <td className="py-1.5 text-neutral-400">{l.meaning}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-neutral-500">
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
    </dialog>
  );
}
