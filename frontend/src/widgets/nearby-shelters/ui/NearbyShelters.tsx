"use client";

import { useRef, useState } from "react";
import { mapUrl, regionPath, sheltersPath, useShelterRegions, useShelters } from "@/entities/shelter";
import { StatusText } from "@/shared/ui";

const LOCATION_TIMEOUT_MS = 10_000; // 위치 요청 시간 초과
const LOCATION_GIVEUP_MS = 15_000; // 권한 팝업에 응답이 없으면 브라우저 timeout 이 돌지 않아 자체로 포기
const LINK = "underline decoration-neutral-700 hover:text-neutral-200";
const BUTTON = "rounded-full border border-white/15 px-3 py-1 text-neutral-200 transition hover:bg-white/10 disabled:opacity-50";
const SELECT = "rounded-md border border-white/15 bg-neutral-900 px-2 py-1 text-neutral-200";

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
  // 마지막 조회 의도의 순번. 늦게 온 위치 콜백이 그 뒤의 지역 선택을 덮어쓰지 않게 한다.
  const seq = useRef(0);
  const result = useShelters(query?.path ?? null);

  if (regions.data?.available === false || result.data?.available === false) return null;

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
        setQuery({ path: `${path}#${id}`, nearby: true });
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
    if (v && list.length === 0) setQuery({ path: regionPath(v), nearby: false });
  };
  const pickSigungu = (v: string) => {
    seq.current++;
    setLocating(false);
    setSigungu(v);
    if (v) setQuery({ path: regionPath(`${sido} ${v}`), nearby: false });
  };

  const items = result.data?.items;
  const nearbyEmpty = query?.nearby && items?.length === 0;

  return (
    <section aria-labelledby="nearby-shelters-title" className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-neutral-400">
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
        {items && items.length > 0 && (
          <ul className="mt-2 space-y-1.5">
            {items.map((s, i) => (
              <li key={`${s.name}-${i}`}>
                <span className="text-neutral-200">{s.name}</span>
                {s.distance_m != null && <span className="text-neutral-300"> · 약 {Math.round(s.distance_m).toLocaleString()} m</span>}
                {s.capacity != null && <span className="text-neutral-500"> · 수용 {s.capacity.toLocaleString()}명</span>}
                <span className="block text-neutral-500">{s.address}</span>
                <a href={mapUrl(s)} target="_blank" rel="noreferrer" className={LINK}>지도에서 보기</a>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="mt-2 text-[11px] text-neutral-500">
        위치는 대피소 검색에만 쓰고 저장하지 않습니다. 약 1km 단위로 반올림해 보냅니다.
        {" "}출처: 행정안전부 민방위 대피시설(공공데이터포털){result.data?.as_of && ` · 기준일 ${result.data.as_of}`}
      </p>
    </section>
  );
}
