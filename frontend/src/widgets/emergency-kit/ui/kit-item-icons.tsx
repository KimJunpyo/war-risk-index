/*
 * 비상 가방 항목 아이콘 그림: Lucide(https://lucide.dev) 아이콘 droplet·pill·radio·id-card·contact·shirt·droplets·utensils·
 * flame·flashlight·briefcase-medical·bath·door-closed·calendar-check 와 담은 타일의 체크 표시 check 의
 * 도형(path·circle·rect)을 lucide 저장소 icons/<이름>.svg 원본에서 그대로 옮겼다.
 * 화생방 대비용품은 lucide 에 방독면 그림이 없어 화생방경보 아이콘(biohazard, entities/guide 의 ALERT_ICON)을 같이 쓴다.
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
 * check·radio 는 lucide LICENSE 의 Feather 유래 목록에 있어 Feather 라이선스(MIT License) 고지도 붙인다:
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
import { ALERT_ICON } from "@/entities/guide";

/** 비상 가방 항목 id(GO_BAG_ITEMS·STOCK_ITEMS) → 아이콘 그림 함수. 틀은 shared/ui 의 Icon 으로 감싼다: <Icon className="h-5 w-5">{KIT_ITEM_ICON[id]()}</Icon>
 *  값을 함수로 두는 이유는 경보 아이콘(entities/guide/ui/alert-icons.tsx)과 같다. 항목을 더하면 여기에도 더한다(없으면 타일을 그리다 멈춤) */
export const KIT_ITEM_ICON: Record<string, () => ReactNode> = {
  // 들고 나가는 3일 가방
  "bag-water-food": () => ( // droplet
    <path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z" />
  ),
  "bag-medicine": () => ( // pill
    <>
      <path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z" />
      <path d="m8.5 8.5 7 7" />
    </>
  ),
  "bag-radio-light": () => ( // radio
    <>
      <path d="M16.247 7.761a6 6 0 0 1 0 8.478" />
      <path d="M19.075 4.933a10 10 0 0 1 0 14.134" />
      <path d="M4.925 19.067a10 10 0 0 1 0-14.134" />
      <path d="M7.753 16.239a6 6 0 0 1 0-8.478" />
      <circle cx="12" cy="12" r="2" />
    </>
  ),
  "bag-documents": () => ( // id-card
    <>
      <path d="M13 19a4 4 0 00-8 0" />
      <path d="M16 10h2" />
      <path d="M16 14h2" />
      <circle cx="9" cy="12" r="3" />
      <rect x="2" y="5" width="20" height="14" rx="2" />
    </>
  ),
  "bag-contact-card": () => ( // contact
    <>
      <path d="M16 2v2" />
      <path d="M7 21v-2a2 2 0 012-2h6a2 2 0 012 2v2" />
      <path d="M8 2v2" />
      <circle cx="12" cy="10" r="3" />
      <rect x="3" y="3" width="18" height="18" rx="2" />
    </>
  ),
  "bag-cbr": ALERT_ICON.cbr, // biohazard
  "bag-clothes-hygiene": () => ( // shirt
    <path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z" />
  ),
  // 집에 두는 7일 비축
  "stock-water": () => ( // droplets
    <>
      <path d="M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z" />
      <path d="M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97" />
    </>
  ),
  "stock-food": () => ( // utensils
    <>
      <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
      <path d="M7 2v20" />
      <path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" />
    </>
  ),
  "stock-stove": () => ( // flame
    <path d="M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4" />
  ),
  "stock-power-out": () => ( // flashlight
    <>
      <path d="M12 13v1" />
      <path d="M17 2a1 1 0 0 1 1 1v4a3 3 0 0 1-.6 1.8l-.6.8A4 4 0 0 0 16 12v8a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2v-8a4 4 0 0 0-.8-2.4l-.6-.8A3 3 0 0 1 6 7V3a1 1 0 0 1 1-1z" />
      <path d="M6 6h12" />
    </>
  ),
  "stock-medicine-hygiene": () => ( // briefcase-medical
    <>
      <path d="M12 11v4" />
      <path d="M14 13h-4" />
      <path d="M16 6V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
      <path d="M18 6v14" />
      <path d="M6 6v14" />
      <rect width="20" height="14" x="2" y="6" rx="2" />
    </>
  ),
  "stock-tap-water": () => ( // bath
    <>
      <path d="M10 4 8 6" />
      <path d="M17 19v2" />
      <path d="M2 12h20" />
      <path d="M7 19v2" />
      <path d="M9 5 7.621 3.621A2.121 2.121 0 0 0 4 5v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" />
    </>
  ),
  "stock-cbr": () => ( // door-closed: 문틈·환기구 막기
    <>
      <path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16" />
      <path d="M2 21h20" />
      <path d="M9 12h.01" />
    </>
  ),
  "stock-expiry": () => ( // calendar-check
    <>
      <path d="M8 2v3" />
      <path d="M16 2v3" />
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18" />
      <path d="m9 15 2 2 4-4" />
    </>
  ),
};

/** 담은 타일의 체크 표시(check). 색만으로 담은 것을 구분하지 않게 바탕과 함께 보인다(plan.md Q9) */
export const CHECK_ICON = () => <path d="M20 6 9 17l-5-5" />;
