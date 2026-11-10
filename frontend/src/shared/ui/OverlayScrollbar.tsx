"use client";

import { useEffect, useRef, useState, type PointerEvent, type ReactNode, type RefObject } from "react";
import { HIDE_DELAY_MS, scrollTopFromDrag, thumbMetrics, type ThumbMetrics } from "../lib/scrollbar";

const HIDDEN: ThumbMetrics = { visible: false, size: 0, offset: 0 };

/** 네이티브 스크롤바 대신 겹쳐 그리는 thumb(레이아웃 폭 0).
 *  ref 를 주면 그 요소(부모는 position: relative)의 thumb, 없으면 문서(페이지) 스크롤의 position: fixed thumb.
 *  휠·키보드·터치 스크롤은 네이티브 그대로이고, thumb는 표시와 드래그만 맡는다. */
export function useOverlayScrollbar(ref?: RefObject<HTMLElement | null>): ReactNode {
  const [metrics, setMetrics] = useState<ThumbMetrics>(HIDDEN);
  const [active, setActive] = useState(false); // 스크롤·호버·드래그 중이거나 숨김 지연 안
  const hover = useRef(false);
  const drag = useRef<{ y: number; top: number; size: number } | null>(null);
  const hideTimer = useRef(0);
  const page = !ref;
  const scroller = () => (ref ? ref.current : document.documentElement);

  // 보이게 하고, 호버·드래그가 없으면 숨김 지연 뒤 흐리게
  const poke = () => {
    setActive(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      if (!hover.current && !drag.current) setActive(false);
    }, HIDE_DELAY_MS);
  };
  const pokeRef = useRef(poke);
  useEffect(() => { pokeRef.current = poke; });

  useEffect(() => {
    const el = ref ? ref.current : document.documentElement;
    if (!el) return;
    const target: HTMLElement | Window = ref ? el : window;
    let frame = 0;
    // 한 프레임에 한 번만 다시 잼
    const measure = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const next = thumbMetrics({ clientHeight: el.clientHeight, scrollHeight: el.scrollHeight, scrollTop: el.scrollTop });
        // 값이 같으면 재렌더 건너뜀
        setMetrics((prev) =>
          prev.visible === next.visible && prev.size === next.size && prev.offset === next.offset ? prev : next);
      });
    };
    const onScroll = () => { measure(); pokeRef.current(); };
    // 터치·펜은 호버로 보지 않음(터치에서는 스크롤 중에만 표시)
    const onEnter = (e: globalThis.PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      hover.current = true;
      pokeRef.current();
    };
    const onLeave = () => {
      if (!hover.current) return;
      hover.current = false;
      pokeRef.current();
    };

    // 컨테이너 크기와 바로 아래 자식(내용) 크기 변화를 모두 봄. 페이지는 html·body
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    for (const child of Array.from(el.children)) observer.observe(child);
    target.addEventListener("scroll", onScroll, { passive: true });
    if (!page) {
      el.addEventListener("pointerenter", onEnter);
      el.addEventListener("pointerleave", onLeave);
    }
    measure();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      clearTimeout(hideTimer.current);
      // 드래그 중 언마운트되면 텍스트 선택 막은 것을 되돌림
      if (drag.current) document.documentElement.style.userSelect = "";
      target.removeEventListener("scroll", onScroll);
      el.removeEventListener("pointerenter", onEnter);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, [ref, page]);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const el = scroller();
    if (!el || e.button !== 0) return;
    // 기본 동작(텍스트 선택·포커스) 막고, 포인터가 영역 밖으로 나가도 계속 받음
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { y: e.clientY, top: el.scrollTop, size: metrics.size };
    document.documentElement.style.userSelect = "none";
    poke();
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const el = scroller();
    const d = drag.current;
    if (!el || !d) return;
    el.scrollTop = scrollTopFromDrag({
      startScrollTop: d.top, deltaY: e.clientY - d.y,
      clientHeight: el.clientHeight, scrollHeight: el.scrollHeight, thumbSize: d.size,
    });
  };
  const endDrag = () => {
    if (!drag.current) return;
    drag.current = null;
    document.documentElement.style.userSelect = "";
    poke();
  };

  // 컨테이너에서 thumb(형제 요소)로 옮겨 가도 호버로 유지
  const onThumbEnter = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse") return;
    hover.current = true;
    poke();
  };
  const onThumbLeave = () => {
    hover.current = false;
    poke();
  };

  if (!metrics.visible) return null;
  return (
    <div
      aria-hidden="true"
      onPointerEnter={onThumbEnter}
      onPointerLeave={onThumbLeave}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
      style={{ top: metrics.offset, height: metrics.size }}
      className={`${page ? "fixed z-50" : "absolute z-10"} right-(--scrollbar-inset) w-(--scrollbar-size) touch-none rounded-full forced-color-adjust-none bg-(--scrollbar-thumb) transition-[opacity,width,background-color] duration-200 select-none hover:w-(--scrollbar-size-hover) hover:bg-(--scrollbar-thumb-hover) motion-reduce:transition-none ${
        active ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
    />
  );
}

/** 내부 세로 스크롤 영역. className 은 바깥(배치용), viewportClassName 은 스크롤 요소(max-h 등)에 붙음.
 *  label 을 주면 스크롤 요소가 Tab 포커스를 받아 키보드(방향키·PageDown 등)로 스크롤됨 — 안에 포커스 받을 요소가 없을 때 사용 */
export function ScrollArea({ children, className = "", viewportClassName = "", label }: {
  children: ReactNode;
  className?: string;
  viewportClassName?: string;
  label?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const thumb = useOverlayScrollbar(ref);
  return (
    <div className={`relative ${className}`}>
      <div
        ref={ref}
        {...(label && { tabIndex: 0, role: "region", "aria-label": label })}
        // 브라우저 기본 포커스 링을 안쪽으로 그려 overflow 에 잘리지 않게
        className={`no-native-scrollbar overflow-y-auto -outline-offset-2 ${viewportClassName}`}
      >
        {/* 내용 크기 변화를 ResizeObserver 로 보기 위한 감싸개 */}
        <div>{children}</div>
      </div>
      {thumb}
    </div>
  );
}

/** 문서(페이지) 스크롤 thumb. html 에 no-native-scrollbar 가 있어야 함 */
export function PageScrollbar() {
  return useOverlayScrollbar();
}
