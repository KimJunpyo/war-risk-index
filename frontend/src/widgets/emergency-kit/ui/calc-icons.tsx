/*
 * 가구원 수 −/+ 아이콘 그림: Lucide(https://lucide.dev) 아이콘 minus·plus 의 도형(path)을
 * lucide 저장소 icons/<이름>.svg 원본에서 그대로 옮겼다. 두 그림은 lucide LICENSE 의
 * "derived from the Feather project" 목록에 있어 Feather 의 MIT License 고지도 함께 둔다.
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
 * Feather 라이선스(MIT License) 고지:
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

/** 가구원 수 −/+ 그림을 돌려주는 함수. 틀(viewBox·선 속성)은 shared/ui 의 Icon 으로 감싼다: <Icon className="h-5 w-5">{CALC_ICON.minus()}</Icon>
 *  값을 요소가 아니라 함수로 두는 이유는 entities/guide/ui/alert-icons.tsx 와 같다(클라이언트 청크에 Fragment 참조가 남지 않게) */
export const CALC_ICON: Record<"minus" | "plus", () => ReactNode> = {
  minus: () => <path d="M5 12h14" />,
  plus: () => (
    <>
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </>
  ),
};
