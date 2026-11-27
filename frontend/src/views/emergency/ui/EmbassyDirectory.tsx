import { countryName } from "@/shared/lib";
import { CALL_CENTER as cc, EMBASSY_SOURCE, embassyCountries, telHref } from "@/widgets/embassy-contacts";
import { getEmbassies } from "../api/get-embassies";

const LINK = "underline decoration-link-line hover:text-fg";
const CARD = "rounded-2xl border border-line bg-surface";

function Tel({ text }: { text: string | null }) {
  const href = text && telHref(text);
  return href ? <a href={href} className={LINK}>{text}</a> : <>{text ?? "–"}</>;
}

/** 재외공관 연락처(#77): 영사콜센터(항상) → 나라별 접기(한국어 이름 가나다순, 공관 이름·종류·주소·전화·긴급전화) → 출처·수집일.
 *  공관은 서버에서 받아 HTML 에 넣는다(브라우저는 API 를 부르지 않음, 오프라인 저장 페이지에도 번호가 남음).
 *  데이터가 없으면(available false) 영사콜센터만 보인다 */
export async function EmbassyDirectory() {
  const bundle = await getEmbassies();
  const countries = embassyCountries(bundle, (iso2) => countryName(iso2, iso2));
  return (
    <>
      <p className={`${CARD} px-4 py-3 text-sm text-fg-soft`}>
        <span className="font-semibold text-fg-strong">영사콜센터</span> 국내 <a href={`tel:${cc.tel}`} className={LINK}>{cc.tel}</a>
        {" "}· 해외 <Tel text={cc.tel_overseas} />
        {" "}(<a href={cc.source} target="_blank" rel="noreferrer" className={LINK}>외교부 영사콜센터</a>)
      </p>
      {countries.length > 0 && (
        <>
          {/* plan.md 7-4: 360·768 1열, lg 이상 2열. 펼친 나라만 길어지도록 행 높이를 맞추지 않는다 */}
          <ul className="mt-3 grid items-start gap-3 lg:grid-cols-2">
            {countries.map((c) => (
              <li key={c.iso2}>
                <details className={CARD}>
                  <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-fg">{c.name}</summary>
                  <ul className="space-y-3 border-t border-line px-4 py-3 text-sm text-fg-soft">
                    {c.embassies.map((e, i) => (
                      <li key={`${e.name}-${i}`} className="break-words">
                        <span className="text-fg">{e.name}</span>
                        {e.kind && <> · {e.kind}</>}
                        {e.address && <span className="block">{e.address}</span>}
                        <span className="block">대표 <Tel text={e.tel} /> · 긴급 <Tel text={e.emergency_tel} /></span>
                      </li>
                    ))}
                  </ul>
                </details>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-fg-muted">
            출처: <a href={EMBASSY_SOURCE.url} target="_blank" rel="noreferrer" className={LINK}>{EMBASSY_SOURCE.name}</a>
            {" "}· 수집일 {bundle.as_of ?? "–"}
          </p>
        </>
      )}
    </>
  );
}
