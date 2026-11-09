"use client";

import { useEffect, useState } from "react";
import { getJson } from "./http";

type State<T> = { path: string | null; data?: T; error?: string };

/** path 가 바뀌면 다시 조회. 이전 path 의 결과는 보여주지 않는다.
 *  refreshMs 를 주면 그 간격으로 다시 조회하고, 갱신 중에는 이전 값을 유지한다. */
export function useFetch<T>(path: string | null, refreshMs?: number) {
  const [state, setState] = useState<State<T>>({ path: null });

  useEffect(() => {
    if (!path) return;
    let ctrl = new AbortController();
    const load = () => {
      ctrl.abort();
      ctrl = new AbortController();
      const signal = ctrl.signal;
      getJson<T>(path, signal)
        .then((data) => setState({ path, data }))
        .catch((e: unknown) => {
          if (signal.aborted) return;
          // 주기 갱신 실패 시에는 이전 값을 그대로 보여줌
          setState((s) => (s.path === path && s.data ? s : { path, error: e instanceof Error ? e.message : String(e) }));
        });
    };
    load();
    const timer = refreshMs ? setInterval(load, refreshMs) : undefined;
    return () => {
      clearInterval(timer);
      ctrl.abort();
    };
  }, [path, refreshMs]);

  const fresh = state.path === path;
  return {
    data: fresh ? state.data : undefined,
    error: fresh ? state.error : undefined,
    loading: path !== null && !fresh,
  };
}
