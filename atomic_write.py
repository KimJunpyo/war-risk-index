"""결과 파일 원자적 쓰기: 같은 폴더의 임시 파일(<대상>.part)에 다 쓴 뒤 대상으로 교체.

API 는 mtime 이 바뀌면 파일을 다시 읽으므로, 쓰는 도중 읽거나 프로세스가 끝나도 대상이 잘린 채 남지 않게 한다.
실패하면 교체하지 않고 예외를 그대로 올린다. 남은 .part 는 다음 호출이 덮어쓴다.
"""

from collections.abc import Callable
from pathlib import Path
from typing import Any

import pandas as pd

PART_SUFFIX = ".part"


def write(path: Path, writer: Callable[[Path], object]) -> None:
    """writer(임시 경로) 로 다 쓴 뒤 대상으로 교체한다."""
    tmp = path.with_name(path.name + PART_SUFFIX)  # with_suffix 는 x.csv.asof 를 x.csv.part 로 바꿈
    writer(tmp)
    tmp.replace(path)


def write_csv(df: pd.DataFrame, path: Path, **kwargs: Any) -> None:
    """df.to_csv(path, **kwargs) 와 같은 결과를 원자적으로 쓴다."""
    write(path, lambda tmp: df.to_csv(tmp, **kwargs))


def write_text(path: Path, text: str, encoding: str = "utf-8") -> None:
    """path.write_text(text, encoding=encoding) 와 같은 결과를 원자적으로 쓴다."""
    write(path, lambda tmp: tmp.write_text(text, encoding=encoding))
