"use client"

import * as React from "react"
import { CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface DatePickerProps {
  value: string | null | undefined
  onChange: (iso: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

function isoToDisplay(iso: string | null | undefined): string {
  if (!iso) return ""
  const p = iso.split("T")[0].split("-")
  if (p.length !== 3) return ""
  return `${p[2]}/${p[1]}/${p[0]}`
}

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]

const WEEKDAYS = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sa", "Do"]

function getMonthGrid(year: number, month: number) {
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  // Monday=1 … Sunday=7; JS getDay: 0=Sun → adjust
  let startDow = firstDay.getDay() - 1
  if (startDow < 0) startDow = 6
  const days: Date[] = []
  // previous month's tail
  const prevMonthLast = new Date(year, month, 0)
  for (let i = startDow - 1; i >= 0; i--) {
    days.push(new Date(year, month - 1, prevMonthLast.getDate() - i))
  }
  // current month
  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push(new Date(year, month, d))
  }
  // next month's head
  const remaining = 42 - days.length // 6 rows × 7 cols
  for (let d = 1; d <= remaining; d++) {
    days.push(new Date(year, month + 1, d))
  }
  return days
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function isSameMonth(date: Date, year: number, month: number) {
  return date.getFullYear() === year && date.getMonth() === month
}

function dateParts(date: Date) {
  return {
    y: date.getFullYear(),
    m: date.getMonth(),
    d: date.getDate(),
  }
}

function toIso(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`
}

export function DatePicker({
  value,
  onChange,
  placeholder = "dd/mm/aaaa",
  className,
  disabled,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false)
  const now = React.useRef(new Date())
  const today = now.current

  let initialY = today.getFullYear()
  let initialM = today.getMonth()
  if (value) {
    const p = value.split("-")
    if (p.length === 3) {
      initialY = Number(p[0])
      initialM = Number(p[1]) - 1
    }
  }

  const [year, setYear] = React.useState(initialY)
  const [month, setMonth] = React.useState(initialM)
  const displayValue = isoToDisplay(value)
  const days = React.useMemo(() => getMonthGrid(year, month), [year, month])

  const handleSelect = (date: Date) => {
    const { y, m, d } = dateParts(date)
    onChange(toIso(y, m, d))
    setOpen(false)
  }

  const prevMonth = () => {
    if (month === 0) {
      setYear((y) => y - 1)
      setMonth(11)
    } else {
      setMonth((m) => m - 1)
    }
  }

  const nextMonth = () => {
    if (month === 11) {
      setYear((y) => y + 1)
      setMonth(0)
    } else {
      setMonth((m) => m + 1)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          className={cn(
            "h-8 w-full justify-start gap-1.5 text-xs font-normal font-mono px-2",
            !displayValue && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="size-3.5 shrink-0 text-muted-foreground" />
          <span>{displayValue || placeholder}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="start">
        <div className="flex flex-col gap-2">
          {/* Header */}
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="icon" className="size-7" onClick={prevMonth}>
              <ChevronLeft className="size-4" />
            </Button>
            <span className="text-sm font-medium">{MONTHS[month]} {year}</span>
            <Button variant="ghost" size="icon" className="size-7" onClick={nextMonth}>
              <ChevronRight className="size-4" />
            </Button>
          </div>
          {/* Weekday headers */}
          <div className="grid grid-cols-7 gap-0.5">
            {WEEKDAYS.map((d) => (
              <div
                key={d}
                className="flex h-7 w-7 items-center justify-center text-[11px] font-medium text-muted-foreground"
              >
                {d}
              </div>
            ))}
          </div>
          {/* Days */}
          <div className="grid grid-cols-7 gap-0.5">
            {days.map((day) => {
              const { y, m, d } = dateParts(day)
              const currentMonth = isSameMonth(day, year, month)
              const selected = value && isSameDay(day, new Date(Number(value.split("-")[0]), Number(value.split("-")[1]) - 1, Number(value.split("-")[2])))
              const isToday = isSameDay(day, today)
              return (
                <Button
                  key={day.toISOString()}
                  variant={selected ? "default" : "ghost"}
                  size="icon"
                  disabled={!currentMonth}
                  className={cn(
                    "h-7 w-7 text-xs rounded-md p-0 font-normal",
                    !currentMonth && "text-muted-foreground/30",
                    isToday && !selected && "border border-border",
                    selected && "bg-primary text-primary-foreground",
                  )}
                  onClick={() => handleSelect(day)}
                >
                  {d}
                </Button>
              )
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
