"use client";

import { GO_BAG_ITEMS, KIT_SOURCES, STOCK_ITEMS } from "@/entities/guide";
import { Icon } from "@/shared/ui";
import { toggleKitItem, useKitChecked } from "../model/kit-checked";
import { CHECK_ICON, KIT_ITEM_ICON } from "./kit-item-icons";
import { SourceLinks } from "./SourceLinks";

const LISTS = [
  { title: "들고 나가는 3일 가방(1인 1개)", items: GO_BAG_ITEMS },
  { title: "집에 두는 7일 비축", items: STOCK_ITEMS },
];
// 항목이 가리키는 출처만 처음 나온 순서로. KIT_SOURCES 의 다른 출처(1-3 장보기 환산 근거 등)는 이 영역에 두지 않는다
const SOURCES = [...new Set(LISTS.flatMap(({ items }) => items.flatMap((it) => it.sources)))].map((k) => KIT_SOURCES[k]);
const LABEL = "text-xs text-fg-muted";

/** 비상 가방 두 목록(위아래)의 아이콘 타일과 끝의 출처. 타일을 누르면 담기고(aria-pressed) 목록마다 진행 글자·막대가 바뀐다.
 *  타일 열 수는 360 2열, md 3열, lg 이상 4열(plan.md 7-7). 담기는 두 목록을 KIT_STORAGE_KEY 하나에 브라우저에만 저장(model/kit-checked) */
export function KitChecklist() {
  const checked = useKitChecked();

  return (
    <div>
      <p className={`mb-4 ${LABEL}`}>담은 항목은 이 브라우저에만 저장됩니다.</p>
      <div className="space-y-6">
        {LISTS.map(({ title, items }) => {
          const done = items.filter((it) => checked.includes(it.id)).length;
          return (
            <div key={title}>
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="font-semibold text-fg">{title}</h3>
                <span className={`shrink-0 ${LABEL}`}>{done}/{items.length} 챙김</span>
              </div>
              <div
                role="progressbar"
                aria-label={`${title} 챙긴 항목`}
                aria-valuemin={0}
                aria-valuemax={items.length}
                aria-valuenow={done}
                className="mt-2 h-1.5 overflow-hidden rounded-full bg-track"
              >
                <div className="h-full bg-success" style={{ width: `${(done / items.length) * 100}%` }} />
              </div>
              <ul className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">
                {items.map((it) => {
                  const on = checked.includes(it.id);
                  return (
                    <li key={it.id}>
                      {/* 담으면 채운 바탕과 체크 표시(plan.md Q9, 색만으로 구분하지 않음). 높이 64px 이상(plan.md 7-8) */}
                      <button
                        aria-pressed={on}
                        onClick={() => toggleKitItem(it.id)}
                        className={`relative flex h-full min-h-16 w-full flex-col items-start gap-2 rounded-xl border p-3 text-left text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg-soft ${
                          on ? "border-success/40 bg-success/10 text-fg-strong" : "border-line bg-surface text-fg-soft hover:bg-surface-hover"
                        }`}
                      >
                        <Icon className={`h-5 w-5 shrink-0 ${on ? "text-success" : "text-fg-muted"}`}>{KIT_ITEM_ICON[it.id]()}</Icon>
                        {on && <Icon className="absolute right-3 top-3 h-4 w-4 text-success">{CHECK_ICON()}</Icon>}
                        <span>{it.text}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
      <p className={`mt-4 ${LABEL}`}>출처 · 문구는 자체 작성</p>
      <SourceLinks sources={SOURCES} />
    </div>
  );
}
