/*
 * 핵심 행동 아이콘 그림: Lucide(https://lucide.dev) 아이콘 arrow-down-to-line·building·radio·backpack·unplug·
 * mouth-off·wind·door-closed·eye-off·hourglass·hand-helping·map-pin 의 도형(path·circle·rect)을
 * lucide 저장소 icons/<이름>.svg 원본에서 그대로 옮겼다.
 * 계단으로 내려가기(stairs)는 lucide 에 계단 그림이 없어 같은 틀(24×24, 선 두께 2, 둥근 선 끝·이음)로 직접 그렸다(plan.md Q1).
 * Lucide 라이선스(ISC License) 고지:
 *
 * Copyright (c) 2026 Lucide Icons and Contributors
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 * radio 는 lucide LICENSE 에 Feather 프로젝트 유래로 적힌 그림이라 Feather 의 MIT License 고지도 둔다:
 *
 * Copyright (c) 2013-present Cole Bemis
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
import type { ReactNode } from "react";
import type { KeyActionIcon } from "@/entities/guide";

/** 핵심 행동(keyActions 의 icon)별 그림을 돌려주는 함수. 틀은 shared/ui 의 Icon 으로 감싼다: <Icon className="h-7 w-7">{KEY_ACTION_ICON[icon]()}</Icon>
 *  지하로 arrow-down-to-line, 건물 안 building, 계단으로 stairs(직접 그림: 바닥까지 내려오는 계단), 방송 듣기 radio, 대피 준비 backpack,
 *  가스·전기 끄기 unplug, 코와 입 가리기 mouth-off, 바람 방향 wind, 틈 막기 door-closed, 엎드려 눈·귀 막기 eye-off,
 *  머물기 hourglass, 구조 hand-helping. 값을 함수로 두는 이유는 entities/guide 의 ALERT_ICON 과 같다 */
export const KEY_ACTION_ICON: Record<KeyActionIcon, () => ReactNode> = {
  "go-down": () => (
    <>
      <path d="M12 17V3" />
      <path d="m6 11 6 6 6-6" />
      <path d="M19 21H5" />
    </>
  ),
  building: () => (
    <>
      <path d="M12 10h.01" />
      <path d="M12 14h.01" />
      <path d="M12 6h.01" />
      <path d="M16 10h.01" />
      <path d="M16 14h.01" />
      <path d="M16 6h.01" />
      <path d="M8 10h.01" />
      <path d="M8 14h.01" />
      <path d="M8 6h.01" />
      <path d="M9 22v-3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" />
      <rect x="4" y="2" width="16" height="20" rx="2" />
    </>
  ),
  stairs: () => (
    <>
      <path d="M2 4h4v4h4v4h4v4h4v4" />
      <path d="M2 20h20" />
    </>
  ),
  radio: () => (
    <>
      <path d="M16.247 7.761a6 6 0 0 1 0 8.478" />
      <path d="M19.075 4.933a10 10 0 0 1 0 14.134" />
      <path d="M4.925 19.067a10 10 0 0 1 0-14.134" />
      <path d="M7.753 16.239a6 6 0 0 1 0-8.478" />
      <circle cx="12" cy="12" r="2" />
    </>
  ),
  bag: () => (
    <>
      <path d="M4 10a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
      <path d="M8 10h8" />
      <path d="M8 18h8" />
      <path d="M8 22v-6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v6" />
      <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
    </>
  ),
  "gas-off": () => (
    <>
      <path d="m19 5 3-3" />
      <path d="m2 22 3-3" />
      <path d="M6.3 20.3a2.4 2.4 0 0 0 3.4 0L12 18l-6-6-2.3 2.3a2.4 2.4 0 0 0 0 3.4Z" />
      <path d="M7.5 13.5 10 11" />
      <path d="M10.5 16.5 13 14" />
      <path d="m12 6 6 6 2.3-2.3a2.4 2.4 0 0 0 0-3.4l-2.6-2.6a2.4 2.4 0 0 0-3.4 0Z" />
    </>
  ),
  "cover-face": () => (
    <>
      <path d="M13.074 7.417a2.6 2.6 0 012.989.099c1.829 1.36 3.053 2.076 5.479 3.644a1 1 0 01.308 1.368 11.6 11.6 0 01-1.617 2.05" />
      <path d="M2 12a50.5 50.5 0 0010.99.99" />
      <path d="m2 2 20 20" />
      <path d="M21 11a1 1 0 011 1 51 51 0 01-3.734.61" />
      <path d="M7.695 7.695c-1.7 1.247-2.92 1.967-5.238 3.464a1 1 0 00-.307 1.369 11.6 11.6 0 0014.766 4.388" />
    </>
  ),
  wind: () => (
    <>
      <path d="M12.8 19.6A2 2 0 1 0 14 16H2" />
      <path d="M17.5 8a2.5 2.5 0 1 1 2 4H2" />
      <path d="M9.8 4.4A2 2 0 1 1 11 8H2" />
    </>
  ),
  seal: () => (
    <>
      <path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16" />
      <path d="M2 21h20" />
      <path d="M9 12h.01" />
    </>
  ),
  "get-down": () => (
    <>
      <path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" />
      <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" />
      <path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" />
      <path d="m2 2 20 20" />
    </>
  ),
  stay: () => (
    <>
      <path d="M5 22h14" />
      <path d="M5 2h14" />
      <path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22" />
      <path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2" />
    </>
  ),
  rescue: () => (
    <>
      <path d="M11 12h2a2 2 0 1 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 14" />
      <path d="m7 18 1.6-1.4c.3-.4.8-.6 1.4-.6h4c1.1 0 2.1-.4 2.8-1.2l4.6-4.4a2 2 0 0 0-2.75-2.91l-4.2 3.9" />
      <path d="m2 13 6 6" />
    </>
  ),
};

/** 가까운 대피소 찾기 링크의 지도 핀(map-pin) */
export const MAP_PIN_ICON = () => (
  <>
    <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
    <circle cx="12" cy="10" r="3" />
  </>
);
