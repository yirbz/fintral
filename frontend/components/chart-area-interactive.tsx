"use client"

import * as React from "react"
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis } from "recharts"

import { useIsMobile } from "@/hooks/use-mobile"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group"

const chartConfig = {
  count: {
    label: "Facturas",
    color: "var(--brand-primary)",
  },
} satisfies ChartConfig

interface VolumePoint {
  date: string
  count: number
}

interface ChartAreaInteractiveProps {
  volumeHistory?: VolumePoint[]
}

export function ChartAreaInteractive({ volumeHistory = [] }: ChartAreaInteractiveProps) {
  const isMobile = useIsMobile()
  const [timeRange, setTimeRange] = React.useState("30d")

  React.useEffect(() => {
    if (isMobile) setTimeRange("7d")
  }, [isMobile])

  const filteredData = React.useMemo(() => {
    if (!volumeHistory.length) return []
    const days = timeRange === "90d" ? 90 : timeRange === "30d" ? 30 : 7
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - days)
    return volumeHistory
      .filter((p) => new Date(p.date) >= cutoff)
      .sort((a, b) => a.date.localeCompare(b.date))
  }, [volumeHistory, timeRange])

  const totalInRange = filteredData.reduce((s, p) => s + p.count, 0)

  const fmt = (dateStr: string) =>
    new Date(dateStr + "T12:00:00").toLocaleDateString("es-DO", {
      month: "short",
      day: "numeric",
    })

  return (
    <Card className="@container/card">
      <CardHeader>
        <div>
          <CardTitle>Volumen de procesamiento</CardTitle>
          <CardDescription className="mt-0.5">
            <span className="hidden @[540px]/card:inline">
              Facturas procesadas por día — período seleccionado
            </span>
            <span className="@[540px]/card:hidden">Facturas por día</span>
          </CardDescription>
        </div>
        <CardAction className="flex items-center gap-3">
          <span className="hidden text-xs tabular-nums text-muted-foreground @[540px]/card:inline">
            {totalInRange} total
          </span>
          <ToggleGroup
            type="single"
            value={timeRange}
            onValueChange={(v) => v && setTimeRange(v)}
            variant="outline"
            className="hidden *:data-[slot=toggle-group-item]:px-4! @[600px]/card:flex"
          >
            <ToggleGroupItem value="7d">7d</ToggleGroupItem>
            <ToggleGroupItem value="30d">30d</ToggleGroupItem>
            <ToggleGroupItem value="90d">90d</ToggleGroupItem>
          </ToggleGroup>
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger
              className="flex w-28 @[600px]/card:hidden"
              size="sm"
              aria-label="Seleccionar período"
            >
              <SelectValue placeholder="30 días" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="7d" className="rounded-lg">7 días</SelectItem>
              <SelectItem value="30d" className="rounded-lg">30 días</SelectItem>
              <SelectItem value="90d" className="rounded-lg">90 días</SelectItem>
            </SelectContent>
          </Select>
        </CardAction>
      </CardHeader>
      <CardContent className="px-2 pt-2 sm:px-6 sm:pt-4">
        {filteredData.length === 0 ? (
          <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
            Sin datos de volumen para este período.
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="aspect-auto h-[200px] w-full">
            <AreaChart data={filteredData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="fillCount" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-count)" stopOpacity={0.35} />
                  <stop offset="40%" stopColor="var(--brand-primary-soft)" stopOpacity={0.18} />
                  <stop offset="100%" stopColor="var(--brand-magenta)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/50" />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={28}
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                tickFormatter={fmt}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={4}
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                allowDecimals={false}
              />
              <ChartTooltip
                cursor={{ stroke: "var(--brand-primary)", strokeWidth: 1, strokeDasharray: "4 4" }}
                content={
                  <ChartTooltipContent
                    labelFormatter={(value) => fmt(value)}
                    indicator="dot"
                  />
                }
              />
              <Area
                dataKey="count"
                type="monotone"
                fill="url(#fillCount)"
                stroke="var(--color-count)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: "var(--color-count)", strokeWidth: 0 }}
              />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}
