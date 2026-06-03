"use client";

import { useRef, useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Calendar } from "lucide-react";
import { getUserDateFormat, formatDate } from "@/lib/utils/date";

function toDisplay(iso: string, pattern: string): string {
  if (!iso) return "";
  const date = new Date(iso + "T00:00:00");
  if (isNaN(date.getTime())) return "";

  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const year = String(date.getUTCFullYear());

  return pattern
    .replace("DD", day)
    .replace("MM", month)
    .replace("YYYY", year);
}

function parseInput(text: string, pattern: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";

  // Determine expected separators from pattern
  const separators = new Set<string>();
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    if (char !== "D" && char !== "M" && char !== "Y") {
      separators.add(char);
    }
  }

  // Build regex to match pattern flexibly
  const sep = separators.size > 0 ? `[${Array.from(separators).join("")}]` : "[-/.]";
  const regex = new RegExp(`^(\\d{1,2})${sep}(\\d{1,2})${sep}(\\d{2,4})$`);
  const match = trimmed.match(regex);
  if (!match) return "";

  // Determine position of DD, MM, YYYY in pattern
  const patternUpper = pattern.toUpperCase();
  const ddPos = patternUpper.indexOf("DD");
  const mmPos = patternUpper.indexOf("MM");
  const yyyyPos = patternUpper.indexOf("YYYY");

  const positions = [
    { pos: ddPos, type: "day" },
    { pos: mmPos, type: "month" },
    { pos: yyyyPos, type: "year" },
  ].sort((a, b) => a.pos - b.pos);

  const values: Record<string, number> = {};
  positions.forEach((p, i) => {
    values[p.type] = parseInt(match[i + 1], 10);
  });

  let { day, month, year } = values;

  // Validate and normalize year
  if (year < 100) {
    year = year < 50 ? 2000 + year : 1900 + year;
  }

  // Validate date
  if (month < 1 || month > 12 || day < 1 || day > 31) return "";

  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return "";
  }

  // Return YYYY-MM-DD
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function DateInput({
  value,
  onChange,
  className,
  id,
  required,
  placeholder,
}: {
  value: string | undefined;
  onChange: (iso: string) => void;
  className?: string;
  id?: string;
  required?: boolean;
  placeholder?: string;
}) {
  const pickerRef = useRef<HTMLInputElement>(null);
  const [pattern, setPattern] = useState("DD/MM/YYYY");
  const [displayValue, setDisplayValue] = useState("");
  const [error, setError] = useState(false);

  useEffect(() => {
    const fmt = getUserDateFormat();
    setPattern(fmt);
    setDisplayValue(toDisplay(value ?? "", fmt));
  }, [value]);

  const handleManualChange = (text: string) => {
    setDisplayValue(text);
    setError(false);

    const parsed = parseInput(text, pattern);
    if (parsed) {
      onChange(parsed);
      setDisplayValue(toDisplay(parsed, pattern));
      setError(false);
    }
  };

  const handleBlur = () => {
    const parsed = parseInput(displayValue, pattern);
    if (displayValue && !parsed) {
      setError(true);
    } else if (parsed) {
      setDisplayValue(toDisplay(parsed, pattern));
      onChange(parsed);
    }
  };

  return (
    <div className="flex gap-1 items-center">
      <Input
        type="text"
        id={id}
        placeholder={placeholder ?? pattern}
        className={cn("h-9 text-xs flex-1", error && "border-red-500", className)}
        value={displayValue}
        onChange={(e) => handleManualChange(e.target.value)}
        onBlur={handleBlur}
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-9 w-9 p-0"
        onClick={() => pickerRef.current?.showPicker()}
      >
        <Calendar className="w-4 h-4" />
      </Button>
      <input
        ref={pickerRef}
        type="date"
        required={required}
        className="sr-only"
        value={value ?? ""}
        onChange={(e) => {
          onChange(e.target.value);
          setDisplayValue(toDisplay(e.target.value, pattern));
          setError(false);
        }}
      />
    </div>
  );
}
