"use client";

import { useState } from "react";
import { RiskChart, useRiskIndex, type ChartPeriod } from "@/entities/risk-index";
import { filterByPeriod, PeriodToggle } from "@/features/select-chart-period";
import { Panel, StatusText } from "@/shared/ui";

/** basePath: 국가 쌍(/api/pairs/{id}) 또는 국가(/api/countries/{code}) */
export function RiskHistory({ basePath }: { basePath: string }) {
  const [period, setPeriod] = useState<ChartPeriod>("3y");
  const { data, loading, error } = useRiskIndex(basePath);

  return (
    <Panel title="지수 추이" action={<PeriodToggle value={period} onChange={setPeriod} />}>
      <StatusText loading={loading} error={error} />
      {data && <RiskChart points={filterByPeriod(data, period)} />}
    </Panel>
  );
}
