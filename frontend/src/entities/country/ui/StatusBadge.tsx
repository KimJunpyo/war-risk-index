import { STATUS_STYLE, type CountryStatus } from "../model/types";

export function StatusBadge({ status }: { status: CountryStatus | null }) {
  if (!status) return null;
  return (
    <span className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${STATUS_STYLE[status].badge}`}>
      {status}
    </span>
  );
}
