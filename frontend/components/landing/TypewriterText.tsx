"use client";

import { useState, useEffect, useCallback } from "react";

const words = ["segundos.", "minutos.", "un click.", "tiempo real."];

const TYPING_SPEED = 70;
const DELETING_SPEED = 35;
const PAUSE_AFTER_TYPE = 2200;
const PAUSE_AFTER_DELETE = 400;

type Phase = "typing" | "pausing" | "deleting" | "waiting";

export function TypewriterText() {
  const [wordIndex, setWordIndex] = useState(0);
  const [display, setDisplay] = useState("");
  const [phase, setPhase] = useState<Phase>("typing");
  const [cursor, setCursor] = useState(true);

  const tick = useCallback(() => {
    setPhase((prev) => {
      const target = words[wordIndex];

      if (prev === "typing") {
        setDisplay(target.slice(0, display.length + 1));
        if (display.length + 1 >= target.length) return "pausing";
        return "typing";
      }

      if (prev === "pausing") return "deleting";

      if (prev === "deleting") {
        setDisplay(target.slice(0, display.length - 1));
        if (display.length - 1 <= 0) return "waiting";
      }

      return prev;
    });
  }, [wordIndex, display]);

  useEffect(() => {
    if (phase === "pausing") {
      const id = setTimeout(() => setPhase("deleting"), PAUSE_AFTER_TYPE);
      return () => clearTimeout(id);
    }

    if (phase === "waiting") {
      const id = setTimeout(() => {
        setWordIndex((i) => (i + 1) % words.length);
        setPhase("typing");
      }, PAUSE_AFTER_DELETE);
      return () => clearTimeout(id);
    }

    if (phase === "typing" || phase === "deleting") {
      const speed = phase === "typing" ? TYPING_SPEED : DELETING_SPEED;
      const id = setTimeout(tick, speed);
      return () => clearTimeout(id);
    }
  }, [phase, tick]);

  useEffect(() => {
    const id = setInterval(() => setCursor((c) => !c), 530);
    return () => clearInterval(id);
  }, []);

  return (
    <span>
      {display}
      <span
        className={`inline-block w-[2px] h-[0.85em] bg-gradient-to-b from-[#0EA5E9] to-[#38BDF8] ml-0.5 align-middle transition-opacity duration-100 ${
          cursor ? "opacity-100" : "opacity-0"
        }`}
        aria-hidden="true"
      />
    </span>
  );
}
