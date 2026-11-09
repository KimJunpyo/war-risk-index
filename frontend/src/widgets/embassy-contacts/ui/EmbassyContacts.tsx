"use client";

import { useFetch } from "@/shared/api";
import { CALL_CENTER as cc, telHref, type EmbassyContacts as Contacts } from "../model/embassy";

const LINK = "underline decoration-neutral-700 hover:text-neutral-200";

function Tel({ text }: { text: string | null }) {
  const href = text && telHref(text);
  return href ? <a href={href} className={LINK}>{text}</a> : <>{text ?? "–"}</>;
}

/** 해외 나라의 대한민국 재외공관(대사관 먼저)과 영사콜센터. 한국·국가 쌍에서는 부모가 렌더링하지 않는다.
 *  영사콜센터는 항상(API 실패·로딩 중 포함), 공관 목록은 데이터가 있을 때만 표시. */
export function EmbassyContacts({ code }: { code: string }) {
  const { data } = useFetch<Contacts>(`/api/countries/${code}/embassies`);
  return (
    <div className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-neutral-400">
      <p className="mb-1.5 text-sm font-semibold text-neutral-200">현지 긴급 연락처</p>
      <p>
        영사콜센터 국내 <a href={`tel:${cc.tel}`} className={LINK}>{cc.tel}</a> · 해외 <Tel text={cc.tel_overseas} />
        {" "}(<a href={cc.source} target="_blank" rel="noreferrer" className={LINK}>외교부 영사콜센터</a>)
      </p>
      {data?.available && data.embassies.length > 0 && (
        <>
          <ul className="mt-2 space-y-1.5">
            {data.embassies.map((e, i) => (
              <li key={`${e.name}-${i}`}>
                <span className="text-neutral-200">{e.name}</span>
                {e.kind && <span className="text-neutral-500"> · {e.kind}</span>}
                {e.address && <span className="block text-neutral-500">{e.address}</span>}
                <span className="block">대표 <Tel text={e.tel} /> · 긴급 <Tel text={e.emergency_tel} /></span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-neutral-500">출처: 외교부 재외공관 정보(공공데이터포털) · 기준일 {data.as_of ?? "–"}</p>
        </>
      )}
    </div>
  );
}
