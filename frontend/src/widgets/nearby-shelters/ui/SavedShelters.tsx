"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { mapUrl } from "@/entities/shelter";
import { countText, filterShelters, formatNumber, PAGE_SIZE, paginate } from "../model/results";
import { clearSaved, readSaved, savedAtText, type SavedShelters as Saved } from "../model/saved";

// /emergency 에서 쓰므로 의미 색 토큰만 쓴다(홈 NearbyShelters 와 같은 모양, 팔레트 클래스 대신 토큰)
const ID = "saved-shelters"; // 홈 저장 안내 링크 /emergency#saved-shelters
const LINK = "underline decoration-link-line hover:text-fg";
const BUTTON = "rounded-full border border-line-strong px-3 py-1 text-fg transition hover:bg-surface-hover";
// max-md:text-base: 16px 보다 작은 입력창은 iOS Safari 가 포커스 때 화면을 확대함
const SEARCH = "w-full rounded-md border border-line-strong bg-field px-2 py-1 text-fg placeholder:text-fg-muted max-md:text-base";
const PAGER_BUTTON = `${BUTTON} aria-disabled:cursor-default aria-disabled:opacity-50 aria-disabled:hover:bg-transparent`;
const CARD_GRID = "grid scroll-mt-2 grid-cols-1 gap-2 @[40rem]:grid-cols-2";
const PUBLIC_KIND = "공공용시설"; // 대부분이 이 값이라 배지를 달지 않는 시설 구분

/** /emergency "저장한 대피소" 영역(이슈 #81). 홈에서 지역으로 찾아 "이 기기에 저장"한 결과를 Cache Storage 에서만 읽는다(API 요청 없음).
 *  저장본이 없거나 Cache Storage 가 없으면 그리지 않는다. 서버 렌더·하이드레이션 때는 비어 있고 effect 에서 읽어 불일치가 없다.
 *  titleClassName: 페이지 영역 제목과 같은 모양 */
export function SavedShelters({ titleClassName }: { titleClassName: string }) {
  const [saved, setSaved] = useState<Saved | null>(null);
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!("caches" in window)) return;
    let alive = true;
    // 저장소 접근이 막히거나(사설 모드 등) 본문이 깨졌으면 그리지 않는다
    readSaved().then((s) => alive && setSaved(s), () => undefined);
    return () => {
      alive = false;
    };
  }, []);

  if (!saved) return null;
  const { items, total, as_of } = saved.result;
  const savedAt = savedAtText(saved.savedAt);
  const matched = filterShelters(items, keyword);
  const view = paginate(matched, page, PAGE_SIZE);
  const goPage = (p: number) => {
    if (p < 1 || p > view.pageCount) return;
    flushSync(() => setPage(p));
    listRef.current?.scrollIntoView({ block: "start" });
  };
  // 지운 뒤 영역이 사라진다. 실패하면(저장소 접근 막힘) 그대로 둔다
  const clear = () => {
    clearSaved().then(() => setSaved(null), () => undefined);
  };

  return (
    <section id={ID} aria-labelledby={`${ID}-title`} className="mt-10">
      <h2 id={`${ID}-title`} className={titleClassName}>저장한 대피소</h2>
      <div className="@container space-y-2 rounded-2xl border border-line px-4 py-3 text-xs text-fg-muted">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p>
            <span className="text-sm font-semibold text-fg-strong">{saved.region}</span>
            {savedAt && ` · 저장 ${savedAt}`}
          </p>
          <button type="button" onClick={clear} className={BUTTON}>지우기</button>
        </div>
        {items.length > 0 && (
          <input
            type="search"
            aria-label="결과에서 찾기"
            placeholder="학교, 주민센터, 동 이름"
            value={keyword}
            onChange={(e) => {
              setKeyword(e.target.value);
              setPage(1);
            }}
            className={SEARCH}
          />
        )}
        <p aria-live="polite">
          {countText({ total, loaded: items.length, matched: matched.length, query: keyword })}
          {view.pageCount > 1 && <span className="sr-only">{` · ${view.page} / ${view.pageCount}쪽`}</span>}
        </p>
        {view.items.length > 0 ? (
          <ul ref={listRef} className={CARD_GRID}>
            {view.items.map((s, i) => (
              <li key={`${s.name}-${i}`} className="flex flex-col rounded-lg border border-line bg-surface-inner px-3 py-2">
                <p className="break-words text-sm font-semibold text-fg">{s.name}</p>
                <p className="mt-0.5 break-words">{s.address}</p>
                <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-1.5">
                  {s.kind && s.kind !== PUBLIC_KIND && (
                    <span className="rounded border border-line-strong px-1.5 text-[11px] text-fg-soft">{s.kind}</span>
                  )}
                  {s.capacity != null && <span>수용 {formatNumber(s.capacity)}명</span>}
                  {/* 지도는 인터넷이 있어야 열린다 */}
                  <a href={mapUrl(s)} target="_blank" rel="noreferrer" className={`ml-auto ${LINK}`}>
                    지도에서 보기<span className="sr-only"> – {s.name}</span>
                  </a>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          keyword.trim() && <p className="break-words">‘{keyword.trim()}’가 들어간 대피소가 없습니다.</p>
        )}
        {view.pageCount > 1 && (
          <div className="flex items-center justify-center gap-3">
            <button type="button" onClick={() => goPage(view.page - 1)} aria-disabled={view.page === 1} className={PAGER_BUTTON}>이전</button>
            <span className="tabular-nums text-fg-soft">{view.page} / {view.pageCount}</span>
            <button type="button" onClick={() => goPage(view.page + 1)} aria-disabled={view.page === view.pageCount} className={PAGER_BUTTON}>다음</button>
          </div>
        )}
        <p className="text-[11px]">
          출처: 행정안전부 민방위 대피시설(공공데이터포털){as_of && ` · 기준일 ${as_of}`}
        </p>
      </div>
    </section>
  );
}
