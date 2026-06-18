"use client"

import { useLayoutEffect, useRef, useState } from "react"
import Link from "next/link"
import gsap from "gsap"
import "./CardNav.css"

interface CardNavLink {
  label: string
  href: string
  ariaLabel?: string
}

interface CardNavItem {
  label: string
  bgColor: string
  textColor: string
  links: CardNavLink[]
}

interface CardNavProps {
  items: CardNavItem[]
  className?: string
  ease?: string
  baseColor?: string
  menuColor?: string
  buttonBgColor?: string
  buttonTextColor?: string
  logo?: React.ReactNode
}

export default function CardNav({
  items,
  className = "",
  ease = "power3.out",
  baseColor = "#fff",
  menuColor,
  buttonBgColor,
  buttonTextColor,
  logo,
}: CardNavProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const navRef = useRef<HTMLDivElement>(null)
  const cardsRef = useRef<(HTMLDivElement | null)[]>([])
  const tlRef = useRef<gsap.core.Timeline | null>(null)
  const topBarRef = useRef<HTMLDivElement>(null)

  const calculateHeight = () => {
    const navEl = navRef.current
    if (!navEl) return 200

    const topBar = 52
    const gap = 6
    const padding = 16
    const firstCard = cardsRef.current[0]
    const cardHeight = firstCard ? firstCard.scrollHeight : 100
    const count = Math.min(items.length, 4)
    return topBar + padding + cardHeight * count + gap * (count - 1) + padding
  }

  const createTimeline = () => {
    const navEl = navRef.current
    const topBar = topBarRef.current
    if (!navEl) return null

    gsap.set(navEl, { height: 52 })
    gsap.set(cardsRef.current, { y: 32, opacity: 0, scale: 0.95 })

    const tl = gsap.timeline({ paused: true })

    tl.to(navEl, {
      height: calculateHeight,
      duration: 0.5,
      ease,
    })

    if (topBar) {
      tl.to(
        topBar,
        { borderBottom: "1px solid rgba(13,37,61,0.06)", duration: 0.2 },
        "-=0.45",
      )
    }

    tl.to(
      cardsRef.current,
      {
        y: 0,
        opacity: 1,
        scale: 1,
        duration: 0.45,
        ease: "back.out(1.7)",
        stagger: 0.05,
      },
      "-=0.2",
    )

    return tl
  }

  useLayoutEffect(() => {
    const tl = createTimeline()
    tlRef.current = tl
    return () => {
      tl?.kill()
      tlRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ease, items])

  useLayoutEffect(() => {
    const handleResize = () => {
      if (!tlRef.current) return
      if (isExpanded) {
        const newHeight = calculateHeight()
        gsap.set(navRef.current, { height: newHeight })
        tlRef.current.kill()
        const newTl = createTimeline()
        if (newTl) {
          newTl.progress(1)
          tlRef.current = newTl
        }
      } else {
        tlRef.current.kill()
        const newTl = createTimeline()
        if (newTl) {
          tlRef.current = newTl
        }
      }
    }
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExpanded])

  const toggleMenu = () => {
    const tl = tlRef.current
    if (!tl) return
    if (!isExpanded) {
      setIsExpanded(true)
      tl.play(0)
    } else {
      tl.eventCallback("onReverseComplete", () => setIsExpanded(false))
      tl.reverse()
    }
  }

  const setCardRef = (i: number) => (el: HTMLDivElement | null) => {
    cardsRef.current[i] = el
  }

  return (
    <nav
      ref={navRef}
      className={`card-nav ${isExpanded ? "open" : ""} ${className}`}
      style={{ backgroundColor: baseColor }}
    >
      <div className="card-nav-top" ref={topBarRef}>
        <button
          type="button"
          className={`card-nav-hamburger ${isExpanded ? "open" : ""}`}
          onClick={toggleMenu}
          aria-label={isExpanded ? "Cerrar menú" : "Abrir menú"}
        >
          <span className="card-nav-line" />
          <span className="card-nav-line" />
        </button>

        {logo && <div className="card-nav-logo">{logo}</div>}

        <div className="card-nav-spacer" />

        <Link
          href="/login"
          className="card-nav-cta"
          style={{ backgroundColor: buttonBgColor, color: buttonTextColor }}
        >
          Comenzar gratis
        </Link>
      </div>

      <div className="card-nav-body" aria-hidden={!isExpanded}>
        {items.slice(0, 4).map((item, idx) => (
          <div
            key={`${item.label}-${idx}`}
            className="card-nav-item"
            ref={setCardRef(idx)}
            style={{ backgroundColor: item.bgColor, color: item.textColor }}
          >
            <span className="card-nav-item-label">{item.label}</span>
            <div className="card-nav-item-links">
              {item.links.map((lnk, i) => (
                <Link
                  key={`${lnk.label}-${i}`}
                  href={lnk.href}
                  className="card-nav-item-link"
                  aria-label={lnk.ariaLabel}
                  onClick={() => {
                    const tl = tlRef.current
                    if (tl) {
                      tl.eventCallback("onReverseComplete", () => setIsExpanded(false))
                      tl.reverse()
                    }
                  }}
                >
                  {lnk.label}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </nav>
  )
}
