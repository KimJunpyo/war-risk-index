// node --test 로 직접 실행하므로 이 파일은 다른 모듈(@/ 별칭 포함)을 import 하지 않는다.

/** 최소 thumb 길이(px) */
export const MIN_THUMB = 24;
/** 스크롤·호버가 끝난 뒤 thumb를 흐리게 하기까지 기다리는 시간(ms) */
export const HIDE_DELAY_MS = 800;

export interface ThumbMetrics {
  visible: boolean;
  size: number;
  offset: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** 트랙(= clientHeight) 위 thumb 길이·위치. 내용이 넘치지 않으면 visible: false */
export function thumbMetrics({ clientHeight, scrollHeight, scrollTop, minThumb = MIN_THUMB }: {
  clientHeight: number;
  scrollHeight: number;
  scrollTop: number;
  minThumb?: number;
}): ThumbMetrics {
  if (scrollHeight <= clientHeight || clientHeight <= 0) return { visible: false, size: 0, offset: 0 };
  const size = Math.min(clientHeight, Math.max(minThumb, (clientHeight * clientHeight) / scrollHeight));
  // 오버스크롤(음수·최대 초과)도 트랙 안으로 클램프
  const ratio = clamp(scrollTop / (scrollHeight - clientHeight), 0, 1);
  return { visible: true, size, offset: ratio * (clientHeight - size) };
}

/** thumb를 deltaY 만큼 끌었을 때의 scrollTop (0 ~ 최대 스크롤로 클램프) */
export function scrollTopFromDrag({ startScrollTop, deltaY, clientHeight, scrollHeight, thumbSize }: {
  startScrollTop: number;
  deltaY: number;
  clientHeight: number;
  scrollHeight: number;
  thumbSize: number;
}): number {
  const maxScroll = Math.max(0, scrollHeight - clientHeight);
  const track = clientHeight - thumbSize;
  // thumb가 트랙을 다 차지하면 환산할 거리가 없음(0 나누기 방지)
  if (track <= 0) return clamp(startScrollTop, 0, maxScroll);
  return clamp(startScrollTop + (deltaY * maxScroll) / track, 0, maxScroll);
}
