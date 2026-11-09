import { countryName } from "@/shared/lib";
import type { Country } from "../model/types";

/** 교전 상대 한 줄: "상대국 러시아 · 무장단체 TTP, BRAS". 상대가 없으면 아무것도 그리지 않음 */
export function Opponents({ country, className = "" }: { country: Pick<Country, "opponents" | "armed_groups">; className?: string }) {
  const states = country.opponents ?? [];
  const groups = country.armed_groups ?? [];
  if (states.length === 0 && groups.length === 0) return null;
  return (
    <span className={className}>
      {states.length > 0 && <>상대국 <b className="text-neutral-200">{states.map((s) => countryName(s, s)).join(", ")}</b></>}
      {states.length > 0 && groups.length > 0 && " · "}
      {groups.length > 0 && (
        // 무장단체 이름은 UCDP 원문(영문 약칭)이라 번역하지 않음
        <>무장단체 <b className="text-neutral-200" title="UCDP 원문 이름">{groups.join(", ")}</b></>
      )}
    </span>
  );
}
