// node --test 로 바로 실행되도록 별칭(@/) import 없는 단일 파일

// 오른·내린 나라 각각 최대 개수
export const TOP_N = 5;

export interface Mover<T> {
  country: T;
  delta: number; // latest.blended − week_ago.blended (반올림 안 함)
}

/** 7일 전 대비 종합 점수 변화 Top N. 빈 값·변화 0 은 제외, 상태("전쟁 중" 등)로는 거르지 않음 */
export function weeklyMovers<T extends {
  code: string;
  latest: { blended: number | null };
  week_ago: { blended: number | null } | null;
}>(countries: T[]): { up: Mover<T>[]; down: Mover<T>[] } {
  const all: Mover<T>[] = [];
  for (const c of countries) {
    const now = c.latest.blended;
    const prev = c.week_ago?.blended;
    if (now === null || prev === null || prev === undefined || now === prev) continue;
    all.push({ country: c, delta: now - prev });
  }
  const byCode = (a: Mover<T>, b: Mover<T>) => (a.country.code < b.country.code ? -1 : a.country.code > b.country.code ? 1 : 0);
  return {
    up: all.filter((m) => m.delta > 0).sort((a, b) => b.delta - a.delta || byCode(a, b)).slice(0, TOP_N),
    down: all.filter((m) => m.delta < 0).sort((a, b) => a.delta - b.delta || byCode(a, b)).slice(0, TOP_N),
  };
}
