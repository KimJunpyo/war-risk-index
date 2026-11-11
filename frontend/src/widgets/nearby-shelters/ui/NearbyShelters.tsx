"use client";

import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import { mapUrl, regionPath, sheltersPath, useShelterRegions, useShelters } from "@/entities/shelter";
import { StatusText } from "@/shared/ui";
import { countText, filterShelters, formatNumber, PAGE_SIZE, paginate } from "../model/results";

const LOCATION_TIMEOUT_MS = 10_000; // 위치 요청 시간 초과
const LOCATION_GIVEUP_MS = 15_000; // 권한 팝업에 응답이 없으면 브라우저 timeout 이 돌지 않아 자체로 포기
const LINK = "underline decoration-neutral-700 hover:text-neutral-200";
const BUTTON = "rounded-full border border-white/15 px-3 py-1 text-neutral-200 transition hover:bg-white/10 disabled:opacity-50";
const SELECT = "rounded-md border border-white/15 bg-neutral-900 px-2 py-1 text-neutral-200";
// max-md:text-base: 16px 보다 작은 입력창은 iOS Safari 가 포커스 때 화면을 확대함. placeholder 는 4.5:1 대비
const SEARCH = "w-full rounded-md border border-white/15 bg-neutral-900 px-2 py-1 text-neutral-200 placeholder:text-neutral-400 max-md:text-base";
// 끝 쪽 버튼은 disabled 대신 aria-disabled: disabled 가 되면 브라우저가 그 버튼의 포커스를 버려 키보드 위치를 잃음
const PAGER_BUTTON = `${BUTTON} aria-disabled:cursor-default aria-disabled:opacity-50 aria-disabled:hover:bg-transparent`;
// 카드 열 수는 화면 폭이 아니라 위젯 안쪽 폭(@container) 기준: 전체 폭(768px 화면에서 686px)은 2열,
// 체크리스트 옆 반 폭(1440px 화면에서 598px)·좁은 화면은 1열. 기준 40rem(640px)은 두 폭의 가운데쯤.
// scroll-mt: 쪽을 바꿔 목록 맨 위로 스크롤할 때 위 여백(스크롤 위치 반올림으로 첫 카드 윗변이 잘리지 않게)
const CARD_GRID = "grid scroll-mt-2 grid-cols-1 gap-2 @[40rem]:grid-cols-2";
const PUBLIC_KIND = "공공용시설"; // 대부분이 이 값이라 배지를 달지 않는 시설 구분

/** 내 주변 민방위 대피소(국내). 위치는 버튼을 눌렀을 때만 요청하고, 거부·실패하면 지역 선택으로 찾는다.
 *  좌표는 상태에도 남기지 않고 반올림한 요청 경로만 들고 있는다. 대피소 데이터가 없으면(available false) 렌더링하지 않음.
 *  지역 목록 로딩·오류 중에도 위치 찾기는 쓸 수 있다(지역 선택만 숨김). */
export function NearbyShelters() {
  const regions = useShelterRegions();
  const [query, setQuery] = useState<{ path: string; nearby: boolean } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locFailed, setLocFailed] = useState(false);
  const [regionOpen, setRegionOpen] = useState(false);
  const [sido, setSido] = useState("");
  const [sigungu, setSigungu] = useState("");
  // 결과 안 검색어와 쪽(1부터). 브라우저 저장소에는 두지 않는다
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  // 마지막 조회 의도의 순번. 늦게 온 위치 콜백이 그 뒤의 지역 선택을 덮어쓰지 않게 한다.
  const seq = useRef(0);
  const listRef = useRef<HTMLUListElement>(null);
  const result = useShelters(query?.path ?? null);

  if (regions.data?.available === false || result.data?.available === false) return null;

  // 새 조회(위치·지역)는 검색어를 비우고 1쪽부터
  const lookup = (q: { path: string; nearby: boolean }) => {
    setQuery(q);
    setKeyword("");
    setPage(1);
  };

  const findNearby = () => {
    const id = ++seq.current;
    const settle = (path: string | null) => {
      if (id !== seq.current) return; // 그 뒤 다른 의도가 있었거나 이미 반영됨
      seq.current++;
      setLocating(false);
      if (path) {
        setSido("");
        setSigungu("");
        // # 뒤 순번은 서버로 가지 않고(fetch 가 버림) 같은 반올림 좌표도 다시 조회하게 한다
        lookup({ path: `${path}#${id}`, nearby: true });
      } else {
        setLocFailed(true);
        setRegionOpen(true);
      }
    };
    if (!navigator.geolocation) return settle(null);
    setLocating(true);
    setLocFailed(false);
    setTimeout(() => settle(null), LOCATION_GIVEUP_MS);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => settle(sheltersPath(coords.latitude, coords.longitude)),
      () => settle(null),
      { timeout: LOCATION_TIMEOUT_MS },
    );
  };

  const sigunguList = regions.data?.regions.find((r) => r.sido === sido)?.sigungu ?? [];
  const pickSido = (v: string) => {
    seq.current++; // 진행 중인 위치 요청은 버림
    setLocating(false);
    setSido(v);
    setSigungu("");
    const list = regions.data?.regions.find((r) => r.sido === v)?.sigungu ?? [];
    // 시·군·구가 없는 시·도(세종)는 바로 조회
    if (v && list.length === 0) lookup({ path: regionPath(v), nearby: false });
  };
  const pickSigungu = (v: string) => {
    seq.current++;
    setLocating(false);
    setSigungu(v);
    if (v) lookup({ path: regionPath(`${sido} ${v}`), nearby: false });
  };

  const items = result.data?.items;
  const hasResults = !!items && items.length > 0;
  const nearbyEmpty = query?.nearby && items?.length === 0;
  const matched = filterShelters(items ?? [], keyword);
  const view = paginate(matched, page, PAGE_SIZE);
  // 쪽을 바꾸면 결과 목록 맨 위로(포커스는 누른 버튼에 그대로). 새 카드를 그린 뒤에 스크롤한다:
  // 그리기 전에 스크롤하면 WebKit 이 스크롤 전에 고른 기준 요소로 scroll anchoring 을 해 되돌린다
  const goPage = (p: number) => {
    if (p < 1 || p > view.pageCount) return; // aria-disabled 인 끝 쪽 버튼을 눌러도 아무 일 없음
    flushSync(() => setPage(p));
    listRef.current?.scrollIntoView({ block: "start" });
  };

  return (
    <section aria-labelledby="nearby-shelters-title" className="@container w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-neutral-400">
      <h3 id="nearby-shelters-title" className="mb-2 text-sm font-semibold text-neutral-200">내 주변 대피소</h3>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={findNearby} disabled={locating} className={BUTTON}>
          {locating ? "위치 확인 중…" : "내 주변 대피소 찾기"}
        </button>
        <button type="button" onClick={() => setRegionOpen(true)} className={BUTTON}>지역으로 찾기</button>
      </div>
      <div aria-live="polite">
        {locFailed && <p className="mt-2 text-amber-300">위치를 쓸 수 없습니다. 지역으로 찾아 주세요.</p>}
        {nearbyEmpty && <p className="mt-2 text-amber-300">주변 5km 안에 등록된 대피소가 없습니다. 지역으로 찾아 주세요.</p>}
      </div>

      {(regionOpen || nearbyEmpty) && !regions.data && (
        <div className="mt-2"><StatusText loading={regions.loading} error={regions.error} /></div>
      )}
      {(regionOpen || nearbyEmpty) && regions.data && (
        <div className="mt-2 flex flex-wrap gap-2">
          <select aria-label="시·도" value={sido} onChange={(e) => pickSido(e.target.value)} className={SELECT}>
            <option value="">시·도 선택</option>
            {regions.data.regions.map((r) => <option key={r.sido} value={r.sido}>{r.sido}</option>)}
          </select>
          {sigunguList.length > 0 && (
            <select aria-label="시·군·구" value={sigungu} onChange={(e) => pickSigungu(e.target.value)} className={SELECT}>
              <option value="">시·군·구 선택</option>
              {sigunguList.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
        </div>
      )}

      <div aria-live="polite">
        <div className="mt-2"><StatusText loading={result.loading} error={result.error} /></div>
        {items && items.length === 0 && !query?.nearby && <p className="mt-2">이 지역에 등록된 대피소가 없습니다.</p>}
      </div>

      {/* 결과: 검색창·건수·카드·페이지 이동. 카드는 live 영역 밖(쪽을 바꿀 때마다 카드를 다 읽지 않게).
          건수 live 영역은 결과가 없을 때도 빈 채로 DOM 에 둔다: 결과와 함께 새로 붙으면 도착을 읽지 않는 스크린리더가 많음 */}
      <div className={hasResults ? "mt-2 space-y-2" : undefined}>
        {hasResults && (
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
          {hasResults && countText({ total: result.data?.total, loaded: items.length, matched: matched.length, query: keyword })}
          {/* 쪽 안내는 스크린리더용(보이는 현재 위치는 아래 페이지 이동). 글자 노드 하나로 바뀌어야 "3 / 53쪽"을 통째로 읽는다 */}
          {hasResults && view.pageCount > 1 && <span className="sr-only">{` · ${view.page} / ${view.pageCount}쪽`}</span>}
        </p>
        {hasResults && (view.items.length > 0 ? (
            <ul ref={listRef} className={CARD_GRID}>
              {view.items.map((s, i) => (
                <li key={`${s.name}-${i}`} className="flex flex-col rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
                  {/* 이름·거리 배지·주소는 각각 그 글자만 담는다. 거리 배지는 오른쪽 위 */}
                  <div className="flex items-start gap-2">
                    <p className="min-w-0 flex-1 break-words text-sm font-semibold text-neutral-200">{s.name}</p>
                    {s.distance_m != null && (
                      <span className="shrink-0 whitespace-nowrap rounded-full bg-white/10 px-2 py-0.5 tabular-nums text-neutral-200">
                        약 {formatNumber(Math.round(s.distance_m))} m
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 break-words text-neutral-500">{s.address}</p>
                  {/* 2열에서 옆 카드보다 짧아도 아래 줄(수용 인원·지도 링크)은 카드 바닥에 맞춘다 */}
                  <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-1.5">
                    {s.kind && s.kind !== PUBLIC_KIND && (
                      <span className="rounded border border-white/15 px-1.5 text-[11px] text-neutral-300">{s.kind}</span>
                    )}
                    {s.capacity != null && <span>수용 {formatNumber(s.capacity)}명</span>}
                    {/* 링크 이름에 시설 이름을 붙여 링크 목록에서도 카드마다 구분되게(보이는 글자는 그대로) */}
                    <a href={mapUrl(s)} target="_blank" rel="noreferrer" className={`ml-auto ${LINK}`}>
                      지도에서 보기<span className="sr-only"> – {s.name}</span>
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="break-words">‘{keyword.trim()}’가 들어간 대피소가 없습니다.</p>
          ))}
        {/* 한 쪽뿐이면(10곳 이하·0곳) 페이지 이동을 그리지 않는다 */}
        {hasResults && view.pageCount > 1 && (
          <div className="flex items-center justify-center gap-3">
            <button type="button" onClick={() => goPage(view.page - 1)} aria-disabled={view.page === 1} className={PAGER_BUTTON}>이전</button>
            <span className="tabular-nums text-neutral-300">{view.page} / {view.pageCount}</span>
            <button type="button" onClick={() => goPage(view.page + 1)} aria-disabled={view.page === view.pageCount} className={PAGER_BUTTON}>다음</button>
          </div>
        )}
      </div>

      <p className="mt-2 text-[11px] text-neutral-500">
        위치는 대피소 검색에만 쓰고 저장하지 않습니다. 약 1km 단위로 반올림해 보냅니다.
        {" "}출처: 행정안전부 민방위 대피시설(공공데이터포털){result.data?.as_of && ` · 기준일 ${result.data.as_of}`}
      </p>
    </section>
  );
}
