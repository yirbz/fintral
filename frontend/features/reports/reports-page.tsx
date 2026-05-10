"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import { getStatistics } from "@/lib/api/statistics";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const PERIODS = ["7d", "30d", "90d"] as const;

const CHART_COLORS = [
  "oklch(0.488 0.243 264.376)",
  "oklch(0.7 0.12 80)",
  "oklch(0.577 0.245 27.325)",
  "oklch(0.6 0.15 160)",
  "oklch(0.5 0.2 320)",
];

export function ReportsPage() {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>("30d");
  const query = useQuery({
    queryKey: ["statistics", period],
    queryFn: () => getStatistics(period)
  });

  const pieData = useMemo(() => {
    const labels = query.data?.audit.distribution.labels ?? [];
    const data = query.data?.audit.distribution.data ?? [];
    return labels.map((label, index) => ({ name: label, value: data[index] ?? 0 }));
  }, [query.data?.audit.distribution.data, query.data?.audit.distribution.labels]);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Analítica de Rendimiento</CardTitle>
            <p className="text-xs text-muted-foreground">Costos, volumen y comportamiento de extracción.</p>
          </div>
          <div className="inline-flex rounded-md border border-border bg-card p-1">
            {PERIODS.map((key) => (
              <Button
                key={key}
                size="sm"
                variant={period === key ? "default" : "ghost"}
                onClick={() => setPeriod(key)}
              >
                {key}
              </Button>
            ))}
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Eficiencia de costos</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={query.data?.charts.volume_history ?? []}>
                <XAxis dataKey="date" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="count" stroke="oklch(0.488 0.243 264.376)" name="Volumen" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Distribución de alertas</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90}>
                  {pieData.map((entry, index) => (
                    <Cell
                      key={`${entry.name}-${index}`}
                      fill={CHART_COLORS[index % CHART_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tendencia de volumen</CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={query.data?.monthly_stats ?? []}>
              <XAxis dataKey="month" fontSize={11} />
              <YAxis fontSize={11} />
              <Tooltip />
              <Bar dataKey="count" fill="oklch(0.488 0.243 264.376)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
