"use client";

import { useEffect, useState } from "react";
import { CHECKLIST_SOURCE, CHECKLIST_STORAGE_KEY, readChecked, toggleChecked } from "../model/checklist";
import { bandFor } from "../model/guide";

/** 선택한 나라·쌍의 점수 구간에 맞는 행동 권고 체크리스트 카드 (체크 상태는 브라우저에만 저장)
 *  beside: lg 이상에서 다른 카드 옆에 반 폭으로 놓이면 true → 항목 1열 (화면 폭만으로는 옆 카드 유무를 알 수 없음) */
export function ActionGuide({ score, status, onMore, beside = false }: {
  score: number | null | undefined;
  status?: string | null;
  onMore: () => void;
  beside?: boolean;
}) {
  const [checked, setChecked] = useState<string[]>([]);

  // 마운트 후에 읽어 SSR 하이드레이션 불일치를 피함. 저장소 접근이 막혀도(사생활 보호 모드 등) 빈 체크로 표시
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 외부 저장소(localStorage) 동기화
      setChecked(readChecked(localStorage.getItem(CHECKLIST_STORAGE_KEY)));
    } catch { /* 무시 */ }
  }, []);

  const toggle = (id: string) => {
    const next = toggleChecked(checked, id);
    setChecked(next);
    try {
      localStorage.setItem(CHECKLIST_STORAGE_KEY, JSON.stringify(next));
    } catch { /* 저장 실패해도 화면 상태는 유지 */ }
  };

  const band = bandFor(score, status);
  if (!band) return null;
  return (
    <div className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
      <div className="mb-1.5 flex items-baseline gap-2">
        <span className={`text-sm font-semibold ${band.tone}`}>권고: {band.title}</span>
        <span className="text-[11px] text-neutral-400">{band.range}</span>
        <button onClick={onMore} className="ml-auto text-[11px] text-neutral-400 underline decoration-neutral-700 hover:text-neutral-200">
          단계별 가이드
        </button>
      </div>
      <ul className={`grid gap-x-6 gap-y-1 text-xs text-neutral-300 md:grid-cols-2 ${beside ? "lg:grid-cols-1" : ""}`}>
        {band.items.map((it) => (
          <li key={it.id}>
            <label className="flex cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                checked={checked.includes(it.id)}
                onChange={() => toggle(it.id)}
                className="mt-0.5 shrink-0 accent-neutral-400"
              />
              <span className={checked.includes(it.id) ? "text-neutral-400 line-through" : ""}>{it.text}</span>
            </label>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[10px] text-neutral-400">
        참고:{" "}
        <a href={CHECKLIST_SOURCE.url} target="_blank" rel="noreferrer" className="underline decoration-neutral-700 hover:text-neutral-400">
          {CHECKLIST_SOURCE.name}
        </a>{" "}
        ({CHECKLIST_SOURCE.checkedAt} 확인) · 문구는 자체 작성. 체크는 이 브라우저에만 저장됩니다.
      </p>
      <p className="mt-0.5 text-[10px] text-neutral-400">뉴스 기반 실험 지표입니다. 정부·민방위·외교부의 공식 경보가 항상 우선합니다.</p>
    </div>
  );
}
