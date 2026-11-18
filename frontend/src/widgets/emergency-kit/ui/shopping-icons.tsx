/*
 * 장보기 목록 복사 버튼 아이콘 그림: Lucide(https://lucide.dev) 아이콘 copy 의 도형(rect·path)을
 * lucide 저장소 icons/copy.svg 원본에서 그대로 옮겼다. copy 는 lucide LICENSE 의
 * "derived from the Feather project" 목록에 없어 Lucide 고지만 둔다.
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
 */
import type { ReactNode } from "react";

/** 장보기 목록 복사 그림을 돌려주는 함수. 틀(viewBox·선 속성)은 shared/ui 의 Icon 으로 감싼다: <Icon className="h-4 w-4">{SHOPPING_ICON.copy()}</Icon>
 *  값을 요소가 아니라 함수로 두는 이유는 entities/guide/ui/alert-icons.tsx 와 같다(클라이언트 청크에 Fragment 참조가 남지 않게) */
export const SHOPPING_ICON: Record<"copy", () => ReactNode> = {
  copy: () => (
    <>
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </>
  ),
};
