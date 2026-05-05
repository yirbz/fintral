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
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Analítica de Rendimiento</CardTitle>
            <p className="text-xs text-muted-foreground">Costos, volumen y comportamiento de extracción.</p>
          </div>
          <div className="inline-flex rounded-md border bg-white p-1">
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
                <Line type="monotone" dataKey="count" stroke="#0071e3" name="Volumen" strokeWidth={2} />
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
                      fill={["#0071e3", "#f59e0b", "#ef4444", "#10b981", "#6366f1"][index % 5]}
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
              <Bar dataKey="count" fill="#1d1d1f" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
