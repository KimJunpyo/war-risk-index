"use client";

import { useEffect, useState } from "react";
import { GO_BAG_ITEMS, KIT_SOURCES, KIT_STORAGE_KEY, readChecked, STOCK_ITEMS, toggleChecked } from "@/entities/guide";
import { SourceLinks } from "./SourceLinks";

const LISTS = [
  { title: "들고 나가는 3일 가방(1인 1개)", items: GO_BAG_ITEMS },
  { title: "집에 두는 7일 비축", items: STOCK_ITEMS },
];
const LABEL = "text-xs text-fg-muted";

/** 비상 가방 두 목록(md 미만 위아래, md 이상 2열)과 끝의 출처. 체크 상태는 두 목록을 KIT_STORAGE_KEY 하나에 브라우저에만 저장 */
export function KitChecklist() {
  const [checked, setChecked] = useState<string[]>([]);

  // 마운트 후에 읽어 SSR 하이드레이션 불일치를 피함(홈 ActionGuide 와 같은 방식). 저장소 접근이 막혀도 빈 체크로 표시
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 외부 저장소(localStorage) 동기화
      setChecked(readChecked(localStorage.getItem(KIT_STORAGE_KEY)));
    } catch { /* 무시 */ }
  }, []);

  const toggle = (id: string) => {
    const next = toggleChecked(checked, id);
    setChecked(next);
    try {
      localStorage.setItem(KIT_STORAGE_KEY, JSON.stringify(next));
    } catch { /* 저장 실패해도 화면 상태는 유지 */ }
  };

  return (
    <div>
      <p className={`mb-3 ${LABEL}`}>체크는 이 브라우저에만 저장됩니다.</p>
      <div className="grid gap-4 md:grid-cols-2">
        {LISTS.map(({ title, items }) => (
          <div key={title} className="rounded-2xl border border-line bg-surface p-5">
            <h3 className="font-semibold text-fg">{title}</h3>
            <ul className="mt-3 space-y-2 text-sm text-fg-soft">
              {items.map((it) => (
                <li key={it.id}>
                  <label className="flex cursor-pointer items-start gap-2">
                    <input
                      type="checkbox"
                      checked={checked.includes(it.id)}
                      onChange={() => toggle(it.id)}
                      className="mt-1 shrink-0 accent-fg-muted"
                    />
                    <span className={checked.includes(it.id) ? "text-fg-muted line-through" : ""}>{it.text}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className={`mt-4 ${LABEL}`}>출처 · 문구는 자체 작성</p>
      <SourceLinks sources={Object.values(KIT_SOURCES)} />
    </div>
  );
}
