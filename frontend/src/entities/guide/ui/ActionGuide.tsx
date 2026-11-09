import { bandFor } from "../model/guide";

/** 선택한 나라·쌍의 점수 구간에 맞는 행동 권고 카드 */
export function ActionGuide({ score, status, onMore }: {
  score: number | null | undefined;
  status?: string | null;
  onMore: () => void;
}) {
  const band = bandFor(score, status);
  if (!band) return null;
  return (
    <div className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
      <div className="mb-1.5 flex items-baseline gap-2">
        <span className={`text-sm font-semibold ${band.tone}`}>권고: {band.title}</span>
        <span className="text-[11px] text-neutral-500">{band.range}</span>
        <button onClick={onMore} className="ml-auto text-[11px] text-neutral-400 underline decoration-neutral-700 hover:text-neutral-200">
          단계별 가이드
        </button>
      </div>
      <ul className="grid gap-x-6 gap-y-1 text-xs text-neutral-300 sm:grid-cols-2">
        {band.actions.map((a) => <li key={a} className="before:mr-1.5 before:text-neutral-600 before:content-['•']">{a}</li>)}
      </ul>
      <p className="mt-2 text-[10px] text-neutral-600">뉴스 기반 실험 지표입니다. 정부·민방위·외교부의 공식 경보가 항상 우선합니다.</p>
    </div>
  );
}
