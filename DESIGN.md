---
version: alpha
name: fintral-design-system
description: Fintral's design language — a Dominican Republic digital invoicing and accounting hub built on a sky-blue brand primary, a deep-navy ink palette, and a signature gradient mesh that occupies the hero of the marketing site. The system pairs the Inter type family at light (300) weights with negative letter-spacing for editorial-density display headlines, and uses tabular-figure body type where money and numerics matter. Buttons are pill-shaped on marketing surfaces and radius-lg in the product dashboard. The dashboard track follows shadcn/ui radix-nova conventions with a sky-blue accent, while the billing satellite switches to an emerald theme.

colors:
  primary: "#0EA5E9"
  primary-deep: "#0284C7"
  primary-press: "#0369A1"
  primary-soft: "#38BDF8"
  primary-bg-subdued: "#E0F2FE"
  brand-dark-900: "#1c1e54"
  ink: "#0d253d"
  ink-secondary: "#273951"
  ink-mute: "#64748d"
  ink-mute-2: "#61718a"
  on-primary: "#ffffff"
  canvas: "#ffffff"
  canvas-soft: "#f6f9fc"
  canvas-cream: "#f5e9d4"
  hairline: "#e3e8ee"
  hairline-input: "#a8c3de"
  ruby: "#ea2261"
  magenta: "#f96bee"
  lemon: "#9b6829"
  shadow-blue: "#003770"
  legacy-indigo: "#533afd"
  legacy-indigo-deep: "#4434d4"
  legacy-indigo-press: "#2e2b8c"

typography:
  display-xxl:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: 56px
    fontWeight: 300
    lineHeight: 1.03
    letterSpacing: -1.4px
    fontFeature: ss01
  display-xl:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: 48px
    fontWeight: 300
    lineHeight: 1.15
    letterSpacing: -0.96px
    fontFeature: ss01
  display-lg:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: 32px
    fontWeight: 300
    lineHeight: 1.1
    letterSpacing: -0.64px
    fontFeature: ss01
  display-md:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: 26px
    fontWeight: 300
    lineHeight: 1.12
    letterSpacing: -0.26px
    fontFeature: ss01
  heading-lg:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: 22px
    fontWeight: 300
    lineHeight: 1.1
    letterSpacing: -0.22px
    fontFeature: ss01
  heading-md:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: 20px
    fontWeight: 300
    lineHeight: 1.4
    letterSpacing: -0.2px
    fontFeature: ss01
  heading-sm:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: 18px
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: 0
    fontFeature: ss01
  body-lg:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: 16px
    fontWeight: 300
    lineHeight: 1.6
    letterSpacing: 0
    fontFeature: ss01
  body-md:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: 15px
    fontWeight: 300
    lineHeight: 1.4
    letterSpacing: 0
    fontFeature: ss01
  body-tabular:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: 14px
    fontWeight: 300
    lineHeight: 1.4
    letterSpacing: -0.42px
    fontFeature: tnum
  button-md:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: 16px
    fontWeight: 500
    lineHeight: 1.0
    letterSpacing: 0
    fontFeature: ss01
  button-sm:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.0
    letterSpacing: 0
    fontFeature: ss01
  caption:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: -0.39px
    fontFeature: tnum
  micro:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: 11px
    fontWeight: 300
    lineHeight: 1.4
    letterSpacing: 0
    fontFeature: ss01
  micro-cap:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: 10px
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: 0.15em
    fontFeature: ss01

rounded:
  xs: 8px
  sm: 8px
  md: 11px
  lg: 14px
  xl: 16px
  pill: 9999px

spacing:
  xxs: 2px
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  xxl: 32px
  huge: 64px

components:
  button-primary-pill:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button-md}"
    rounded: "{rounded.pill}"
    padding: 14px 36px
    minWidth: 160px
  button-primary-pill-pressed:
    backgroundColor: "{colors.primary-press}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button-md}"
    rounded: "{rounded.pill}"
    padding: 14px 36px
    minWidth: 160px
  button-secondary:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.primary}"
    typography: "{typography.button-md}"
    rounded: "{rounded.pill}"
    padding: 14px 36px
    minWidth: 160px
  button-on-dark:
    backgroundColor: "{colors.brand-dark-900}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button-md}"
    rounded: "{rounded.pill}"
    padding: 14px 36px
    minWidth: 160px
  button-dashboard:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button-sm}"
    rounded: "{rounded.lg}"
    padding: 12px 28px
    minWidth: 120px
  button-dashboard-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.primary}"
    typography: "{typography.button-sm}"
    rounded: "{rounded.lg}"
    padding: 12px 28px
    minWidth: 120px
  text-input:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.sm}"
    padding: 8px 12px
  text-input-focused:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.sm}"
    padding: 8px 12px
  card-feature-light:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.lg}"
    padding: 32px
  card-pricing:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.lg}"
    padding: 32px
  card-pricing-featured:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-primary}"
    typography: "{typography.body-md}"
    rounded: "{rounded.lg}"
    padding: 32px
  card-cream-band:
    backgroundColor: "{colors.canvas-cream}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.lg}"
    padding: 32px
  card-dashboard-mockup:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-primary}"
    typography: "{typography.body-tabular}"
    rounded: "{rounded.xl}"
    padding: 24px
  pill-tag-soft:
    backgroundColor: "{colors.primary-bg-subdued}"
    textColor: "{colors.primary-deep}"
    typography: "{typography.micro-cap}"
    rounded: "{rounded.pill}"
    padding: 4px 8px
  nav-bar-on-mesh:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.xs}"
    padding: 16px 24px
  link-on-light:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.primary}"
    typography: "{typography.body-md}"
    rounded: "{rounded.xs}"
    padding: 0px
  footer-light:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink-mute}"
    typography: "{typography.caption}"
    rounded: "{rounded.xs}"
    padding: 64px 24px
  logo-bar:
    backgroundColor: "transparent"
    textColor: "{colors.canvas}"
    typography: "{typography.body-md}"
    rounded: "{rounded.xs}"
    padding: 0px
---

## Overview

Fintral's design language opens with the gradient mesh — a wide horizontal band of sky-blue, soft cyan, lavender, indigo, and ruby occupying the hero of the marketing page. The mesh is implemented as CSS blur-blended blobs (not SVG) with `mix-blend-multiply` for an organic atmospheric backdrop. Type and product UI mockups float above it, with the gradient acting as both decoration and visual anchor. Below the fold, the page returns to white, with feature explanations on `{colors.canvas-soft}` (a barely-tinted cool off-white) and dashboard mockups composited as faux IDE/console panels in deep navy.

The color system has two primary roles. **Sky-blue** (`{colors.primary}` — `#0EA5E9`) is the brand's primary CTA color, used across pricing cards, dashboard UI, and marketing sections. A **legacy indigo** (`{colors.legacy-indigo}` — `#533afd`) persists in hero and navigation CTAs as a secondary brand accent. **Deep navy** (`{colors.ink}` — `#0d253d`) is the universal body text color and the fill of dashboard mockups, the featured pricing tier, and dark-app surfaces. Ruby (`{colors.ruby}`) and magenta (`{colors.magenta}`) appear inside the gradient mesh and as accent dots in product UI mockups; they are not used as button colors.

Typography is built around **Inter** at weight 300 with negative letter-spacing — the brand's editorial-density display signature. Display sizes (32–56px) use -1.4px to -0.64px tracking; body sizes use 0; tabular caption sizes (where money and numerics matter) use the OpenType `tnum` feature plus a tightening -0.42px tracking. The `ss01` stylistic set is enabled across all text roles via the body element.

The product dashboard follows **shadcn/ui radix-nova** conventions with a sky-blue (`--primary: hsl(199 89% 48%)`) accent ring. The billing satellite (`/billing/*`) switches to an **emerald** theme (`--primary: #059669`) as a contextual variation.

**Key Characteristics:**
- Gradient-mesh backdrop on the marketing hero — sky-blue/cyan/lavender/indigo/ruby blobs horizontally washed with `mix-blend-multiply` and CSS blur.
- Sky-blue CTA hierarchy: filled `{colors.primary}` pill is the primary button on marketing surfaces.
- Legacy indigo `#533afd` accent on hero and navigation CTAs — a secondary brand color being phased into sky-blue across all surfaces.
- Inter light (weight 300) display tier with negative tracking from -1.4px to -0.2px depending on size.
- Tabular-figure body type (`tnum`) for any cell containing money or numerics — the brand's quiet financial-data signal.
- Dark-app dashboard mockup: deep navy product UI composites sit above the white canvas with rendered tables and charts inside.
- Pill-shaped buttons (`{rounded.pill}` 9999px) on marketing surfaces; radius-lg (`{rounded.lg}` 14px) buttons in the product dashboard.
- Cream-band feature cards (`{colors.canvas-cream}`) introduce a warm interlude between blue/white sections.
- Dual-theme product UI: sky-blue for the main dashboard, emerald for the billing satellite.
- Full dark mode support with all product surfaces adapted via CSS custom properties.

## Colors

> **Source pages:** marketing (`/`), pricing (`/#pricing`), dashboard (`/dashboard/*`), billing (`/billing/*`).

### Brand & Accent
- **Sky-blue** (`{colors.primary}` — `#0EA5E9`): The brand's primary CTA color. Filled buttons, link emphasis, gradient anchor, dashboard accent ring.
- **Sky-blue Deep** (`{colors.primary-deep}` — `#0284C7`): Hover state for primary CTAs.
- **Sky-blue Press** (`{colors.primary-press}` — `#0369A1`): Pressed-state lift of the primary.
- **Sky-blue Soft** (`{colors.primary-soft}` — `#38BDF8`): Lighter accent used in product-UI accents, chart highlights, and logo bars.
- **Sky-blue Subdued** (`{colors.primary-bg-subdued}` — `#E0F2FE`): Pale sky fill used as soft tag background and alert banners.
- **Legacy Indigo** (`{colors.legacy-indigo}` — `#533afd`): Secondary brand accent appearing in hero CTAs and navigation. Being phased toward sky-blue.
- **Legacy Indigo Deep** (`{colors.legacy-indigo-deep}` — `#4434d4`): Hover for legacy indigo CTAs.
- **Legacy Indigo Press** (`{colors.legacy-indigo-press}` — `#2e2b8c`): Pressed for legacy indigo CTAs.
- **Brand Dark 900** (`{colors.brand-dark-900}` — `#1c1e54`): Deep navy used in dashboard chrome and featured tier surfaces.
- **Ruby** (`{colors.ruby}` — `#ea2261`): Gradient accent and chart highlight; never a button.
- **Magenta** (`{colors.magenta}` — `#f96bee`): Brighter pink stop in gradient meshes and chart accents.
- **Lemon** (`{colors.lemon}` — `#9b6829`): Warm sherbet stop in gradient backdrops.

### Surface
- **Canvas** (`{colors.canvas}` — `#ffffff`): Default page background.
- **Canvas Soft** (`{colors.canvas-soft}` — `#f6f9fc`): Cool-tinted off-white used on feature bands beneath the gradient hero.
- **Canvas Cream** (`{colors.canvas-cream}` — `#f5e9d4`): Warm cream used as a feature-band fill — the brand's chromatic interlude.
- **Hairline** (`{colors.hairline}` — `#e3e8ee`): 1px borders on cards and tables.
- **Hairline Input** (`{colors.hairline-input}` — `#a8c3de`): Slightly cooler hairline used on form inputs.

### Text
- **Ink** (`{colors.ink}` — `#0d253d`): Default body text color across the brand. Deep navy, never pure black.
- **Ink Secondary** (`{colors.ink-secondary}` — `#273951`): Secondary text on white.
- **Ink Mute** (`{colors.ink-mute}` — `#64748d`): Helper text, captions, table labels.
- **Ink Mute 2** (`{colors.ink-mute-2}` — `#61718a`): Near-equivalent to ink-mute used in nav and footers.
- **On Primary** (`{colors.on-primary}` — `#ffffff`): Text on sky-blue / dark-navy / emerald surfaces.

### Semantic
The brand does not use a separate semantic color palette in the marketing system — error / success states live in dashboard product UI specifically.

### Product UI Theme (CSS Variables)
The product dashboard uses shadcn/ui CSS custom properties with sky-blue as the accent:

| Variable | Light | Dark |
|---|---|---|
| `--primary` | `hsl(199 89% 48%)` ≈ `#0EA5E9` | `hsl(199 89% 48%)` (same) |
| `--background` | `hsl(210 20% 98%)` | `hsl(224 71% 4%)` |
| `--foreground` | `hsl(224 71% 4%)` | `hsl(210 20% 98%)` |
| `--card` | `hsl(0 0% 100%)` | `hsl(222 47% 7%)` |
| `--border` | `hsl(214 20% 91%)` | `hsl(215 28% 16%)` |
| `--ring` | `hsl(199 89% 48%)` | `hsl(199 89% 48%)` |
| `--radius` | `0.875rem` (14px) | same |

### Billing Theme (Emerald)
The billing satellite (`/billing/*`) overrides the theme to emerald:

| Variable | Value |
|---|---|
| `--primary` | `hsl(142.1 76.2% 36.3%)` ≈ `#059669` |
| `--ring` | same |
| Logo primary | `#34d399` (emerald-400) |
| Logo secondary | `#6ee7b7` (emerald-300) |
| Logo light primary | `#10b981` (emerald-500) |

### Logo Colors
The Fintral logo uses a three-bar system with sky-blue tones:

| Token | Main Theme | Billing Theme |
|---|---|---|
| `--logo-primary` | `#38bdf8` (sky-400) | `#34d399` (emerald-400) |
| `--logo-secondary` | `#7dd3fc` (sky-300) | `#6ee7b7` (emerald-300) |
| `--logo-light-primary` | `#0ea5e9` (sky-500) | `#10b981` (emerald-500) |

## Typography

### Font Family

The display and UI tier is **Inter** (Google Fonts) at weights 300 (light), 400 (regular), 500 (medium), and 600 (semibold). Inter is loaded via Next.js `next/font/google` with subsets for Latin. Monospace is **Geist Mono** (via `next/font/google`).

The `font-feature-settings: "ss01"` stylistic set is enabled on the body element — Inter substitutes single-story `a` and other character variants that are part of the brand's typographic signature.

For the brand helper class, `font-brand` resolves to `Inter, system-ui, -apple-system, sans-serif`.

### Hierarchy

| Token | Size | Weight | Line Height | Letter Spacing | Use |
|---|---|---|---|---|---|
| `{typography.display-xxl}` | 56px | 300 | 1.03 | -1.4px | Hero headline |
| `{typography.display-xl}` | 48px | 300 | 1.15 | -0.96px | Section opener |
| `{typography.display-lg}` | 32px | 300 | 1.1 | -0.64px | Card title / sub-section |
| `{typography.display-md}` | 26px | 300 | 1.12 | -0.26px | Compact card title / stat number |
| `{typography.heading-lg}` | 22px | 300 | 1.1 | -0.22px | Pricing tier name |
| `{typography.heading-md}` | 20px | 300 | 1.4 | -0.2px | Section sub-heading |
| `{typography.heading-sm}` | 18px | 500 | 1.4 | 0 | Mini-section label |
| `{typography.body-lg}` | 16px | 300 | 1.6 | 0 | Marketing body lead |
| `{typography.body-md}` | 15px | 300 | 1.4 | 0 | Default UI body |
| `{typography.body-tabular}` | 14px | 300 | 1.4 | -0.42px | Money / numeric tables (uses `tnum`) |
| `{typography.button-md}` | 16px | 500 | 1.0 | 0 | Pill button label (marketing) |
| `{typography.button-sm}` | 14px | 500 | 1.0 | 0 | Compact pill / dashboard button |
| `{typography.caption}` | 13px | 400 | 1.4 | -0.39px | Helper text, table labels |
| `{typography.micro}` | 11px | 300 | 1.4 | 0 | Fine print |
| `{typography.micro-cap}` | 10px | 600 | 1.15 | 0.15em | All-caps eyebrow badge |

### Principles
- **Light weight is the brand.** Display tiers always render at weight 300. Bumping to 500+ removes the brand's editorial air.
- **Negative tracking on display.** -1.4px at 56px, scaling proportionally down to -0.2px at 20px. The negative tracking is the typographic signature.
- **Medium weight on buttons.** Button labels use weight 500 for legibility at small sizes, not 400 or 300.
- **Semibold on micro-cap.** Small all-caps tags use weight 600 with 0.15em letter-spacing for emphasis.
- **Tabular figures for money.** Any cell rendering currency, transaction amounts, or numeric counts uses `font-feature-settings: "tnum"` plus a tightening tracking. The brand quietly signals its financial DNA through this micro-detail.
- **`ss01` globally.** Apply `font-feature-settings: "ss01"` to the body element so the stylistic-set substitution is on for every text role.

## Layout

### Spacing System
- **Base unit**: 8px (with 2 / 4 / 12 sub-tokens for fine work).
- **Tokens**: `{spacing.xxs}` 2px · `{spacing.xs}` 4px · `{spacing.sm}` 8px · `{spacing.md}` 12px · `{spacing.lg}` 16px · `{spacing.xl}` 24px · `{spacing.xxl}` 32px · `{spacing.huge}` 64px.
- **Section padding**: 64–96px on marketing surfaces; 32–48px on dashboard / product surfaces.
- **Card internal padding**: 32px on feature cards; 24px on dashboard mockups.

### Grid & Container
- Marketing pages center in a ~1200px container with the gradient mesh extending edge-to-edge above.
- Pricing collapses 4-up → 2-up → 1-up at 1024 / 768 breakpoints.
- Dashboard product mockups use their own internal grids (12-col tables, 3-col card grids) rendered as static composites.
- Dashboard product UI uses Tailwind's standard grid with shadcn/ui sidebar layout.

### Whitespace Philosophy
The gradient mesh occupies the hero; the white canvas below is generously padded. Section gaps tend toward 96px, with content tightening to 32px on dashboard / pricing pages where users compare and act.

## Elevation & Depth

| Level | Treatment | Use |
|---|---|---|
| 0 | Flat | Default surface |
| 1 | `box-shadow: rgba(0,55,112,0.08) 0 1px 3px` | Card lift on white |
| 2 | `box-shadow: rgba(0,55,112,0.08) 0 8px 24px, rgba(0,55,112,0.04) 0 2px 6px` | Floating panels, dashboard mockup chrome |
| 3 | `box-shadow: rgba(13,37,61,0.4) 0 24px 48px -12px, rgba(13,37,61,0.2) 0 8px 24px` | Dashboard mockup deep shadow |
| 4 | Gradient mesh backdrop | The brand's primary depth medium — atmospheric color rather than literal shadow |

### Shadow Tokens (Tailwind)
| Token | Value |
|---|---|
| `shadow-brand` | Level 1 |
| `shadow-brand-lg` | Level 2 |
| `shadow-brand-xl` | Level 3 |
| `shadow-card` | `0 1px 3px rgba(0,0,0,0.03), 0 1px 2px rgba(0,0,0,0.04)` |
| `shadow-elevated` | `0 8px 32px rgba(0,0,0,0.06)` |
| `shadow-button` | `0 1px 2px rgba(56,189,248,0.08)` |

### Decorative Depth
The gradient mesh IS the depth system. Implemented as CSS blur-blended blobs with `mix-blend-multiply` — layered colored blobs with `filter: blur()` that create organic, painterly shapes. The mesh provides the brand's signature lift; literal shadows are reserved for product-UI mockups and stay subtle.

## Shapes

### Border Radius Scale

| Token | Value | Use |
|---|---|---|
| `{rounded.xs}` | 8px | Hairline tags, nav bar |
| `{rounded.sm}` | 8px | Form inputs |
| `{rounded.md}` | 11px | Compact cards, alerts (shadcn md) |
| `{rounded.lg}` | 14px | Pricing cards, feature cards, dashboard buttons (shadcn lg) |
| `{rounded.xl}` | 16px | Dashboard product mockup chrome |
| `{rounded.pill}` | 9999px | Marketing buttons, tag pills |

**Note on button radius:** Marketing surfaces use `{rounded.pill}` (pill shape) for all CTAs. The product dashboard uses `{rounded.lg}` (14px) for shadcn/ui buttons — the radix-nova default radius. This distinction is intentional: marketing favors decisive, pill-shaped CTAs while the dashboard follows standard UI conventions.

### Photography Geometry
The brand uses **product UI mockups** more than photography. Dashboard composites render as faux IDE/terminal/dashboard chrome inside `{rounded.xl}` 16px containers with a `shadow-brand-xl`. Real photography appears in customer logo strips and the rare case-study card; treated as inset 4:3 with no shadow.

## Components

### Buttons — Philosophy

Buttons are not containers for text — they are intentional volumetric elements with a fixed, generous footprint. The label lives inside the button, not the other way around. Marketing pills measure `14px 36px` padding with a `160px` minimum width, giving every CTA a consistent, commanding presence regardless of label length. Dashboard buttons are proportionally substantial at `12px 28px` with a `120px` minimum. This sizing is the brand's signature: buttons that feel planted, decisive, and unmistakable.

**Marketing — `button-primary-pill`** — the dominant CTA on marketing surfaces.
- Background `{colors.primary}`, text `{colors.on-primary}`, type `{typography.button-md}`, padding `14px 36px`, min-width `160px`, rounded `{rounded.pill}` 9999px.
- On hero and navigation, uses `{colors.legacy-indigo}` instead (being unified to sky-blue).
- Hover: `{colors.primary-deep}` (or `{colors.legacy-indigo-deep}` for legacy).
- Pressed state `button-primary-pill-pressed` shifts background to `{colors.primary-press}` (or `{colors.legacy-indigo-press}`).

**Marketing — `button-secondary`** — outline-style alternative.
- Background `{colors.canvas}`, text `{colors.primary}`, 1px solid `{colors.primary}` border, same pill geometry and footprint.

**Marketing — `button-on-dark`** — used on dark pricing card.
- Background `{colors.ink}`, text `{colors.on-primary}`, same pill geometry and footprint.

**Dashboard — `button-dashboard`** — shadcn/ui default button.
- Background `{colors.primary}`, text `{colors.on-primary}`, type `{typography.button-sm}`, padding `12px 28px`, min-width `120px`, rounded `{rounded.lg}` 14px.
- Uses shadcn `variant: "default"`, size `"default"` (h-9).
- Secondary variant: background transparent, text `{colors.primary}`, 1px border.

### Cards & Containers

**`card-feature-light`** — feature explanation card on white.
- Background `{colors.canvas}`, padding `{spacing.xxl}`, rounded `{rounded.lg}` 12px (hardcoded), 1px `{colors.hairline}` border, optional `shadow-brand`.

**`card-pricing`** — standard pricing tier.
- Background `{colors.canvas}`, padding `{spacing.xxl}`, rounded `{rounded.lg}` (hardcoded 12px), 1px `{colors.hairline}` border. Title `{typography.heading-lg}`, price `{typography.display-md}`, body `{typography.body-md}`, CTA pinned bottom as `button-primary-pill`.

**`card-pricing-featured`** — the inverted dark featured tier.
- Background `{colors.ink}` (`#0d253d`), text `{colors.on-primary}`, border `{colors.primary}`, shadow `0 4px 24px rgba(14,165,233,0.15)`. The deep-navy fill is the brand's distinctive featured-tier choice.

**`card-cream-band`** — warm interlude card.
- Background `{colors.canvas-cream}`, text `{colors.ink}`, padding `{spacing.xxl}`, rounded `{rounded.lg}` (hardcoded 12px). Used to break up the sky-blue / white rhythm with warmth.

**`card-dashboard-mockup`** — composited dashboard / product UI screenshot on marketing.
- Background `{colors.ink}` (`#0d253d`), type `{typography.body-tabular}` (with `tnum`), padding `{spacing.xl}` 24px, rounded `{rounded.xl}` 16px, `shadow-brand-xl`. Chrome effect with `border border-[#1c1e54]` and traffic-light dots (red/amber/green). Contains nested mini-mockups: code preview + dashboard table + chart card.

### Inputs & Forms

**`text-input`** — standard form field.
- Background `{colors.canvas}`, text `{colors.ink}`, type `{typography.body-md}`, padding `{spacing.sm} {spacing.md}` (8px 12px), rounded `{rounded.sm}` 6px, 1px `{colors.hairline-input}` border.
- Focus state: border swaps to `{colors.primary}`.

### Navigation

**`nav-bar-on-mesh`** — top nav floating over the gradient hero.
- Background `{colors.canvas}` (or transparent depending on scroll), text `{colors.ink}`, padding `{spacing.lg} {spacing.xl}`. Logo wordmark on the left, primary nav center, sign-in + filled `button-primary-pill` (legacy indigo) on the right.

### Pills, Tags, and Chips

**`pill-tag-soft`** — subdued sky-blue tag.
- Background `{colors.primary-bg-subdued}`, text `{colors.primary-deep}`, type `{typography.micro-cap}`, padding `4px 8px`, rounded `{rounded.pill}`.

### Navigation & Sidebar (Dashboard)

The product dashboard uses shadcn/ui **radix-nova sidebar** with:
- Fixed left sidebar, collapsible via `--sidebar-width: 16rem`.
- Mobile: slide-in overlay sidebar with `sidebar-slide-in` animation.
- Sky-blue accent (`--sidebar-primary`, `--sidebar-ring`).
- Dark mode supported via `.dark` CSS variables.

### Signature Components

**Gradient Mesh Backdrop** — sky-blue → soft cyan → lavender → indigo → ruby pink CSS blobs with `mix-blend-multiply` and `filter: blur()` across the hero section. Implemented as layered `<div>` elements with `animate-blob-float`, `animate-blob-float-2`, and `animate-blob-pulse` animations for organic movement. Not a flat CSS gradient — the real mesh has organic blob shapes with staggered animation.

**Composited Dashboard Mockup** — multi-layer faux-product-UI compositions: an IDE panel on the left, a dashboard table center, a chart card on the right, all rendered at small scale inside `{rounded.xl}` containers with dark-navy (`ink`) background and `shadow-brand-xl` shadows. The composite is the brand's most-photographed feature.

**Tabular-Figure Money Type** — every number rendering money, count, or transaction value uses `font-feature-settings: "tnum"`. The brand's quiet signal that it's a financial-platform.

**`link-on-light`** — inline links on light surfaces.
- Text `{colors.primary}` rendered in `{typography.body-md}`, no underline by default.

**`footer-light`** — site-wide footer.
- Background `{colors.canvas}`, text `{colors.ink-mute}`, type `{typography.caption}`, padding `{spacing.huge} {spacing.xl}` (64px 24px). Holds 4–6 columns of link groups, social icons, and a small legal row. Hover links use `{colors.legacy-indigo}`.

**Fintral Logo** — three-bar horizontal logo implemented as SVG or styled `<div>` elements. Uses CSS custom properties for theming:
- Main theme: `var(--logo-primary)` = `#38bdf8`, `var(--logo-secondary)` = `#7dd3fc`
- Billing theme: `var(--logo-primary)` = `#34d399`, `var(--logo-secondary)` = `#6ee7b7`
- Entrance animation: `animate-logo-fade` (0.6s ease-out) + `animate-logo-dot` (1.4s ease-in-out infinite) for dot elements.

## Dark Mode

The product dashboard supports full dark mode via the `.dark` class on `<html>`. All CSS custom properties switch to dark-adapted values:

- `--background`: `hsl(224 71% 4%)` — near-black
- `--foreground`: `hsl(210 20% 98%)` — near-white
- `--primary`: unchanged (`hsl(199 89% 48%)`) — sky-blue stays visible on dark
- `--card`: `hsl(222 47% 7%)` — subtly lighter than background
- `--border`: `hsl(215 28% 16%)` — muted dark stroke

**Implementation:** Apply `.dark` class to `document.documentElement` via a theme toggle component. The system respects `prefers-color-scheme` on first load and persists the preference.

## Do's and Don'ts

### Do
- Reserve `{colors.primary}` (sky-blue) for filled CTAs and link emphasis — it should appear sparingly, one filled button per band.
- Apply the gradient mesh to every marketing hero; bare-canvas heroes feel off-brand.
- Render display tiers at weight 300 with negative letter-spacing — the thin tracking is the typographic signature.
- Use `font-feature-settings: "tnum"` on every money / numeric cell.
- Apply `font-feature-settings: "ss01"` globally on the body element.
- Pair every feature explanation with a composited product UI mockup; the brand's argument is "look at the actual product."
- Use pill-shaped buttons (`rounded-full`) on marketing surfaces and radius-lg (`rounded-lg`) in the dashboard.
- Use dark mode variables for all product UI surfaces; the `.dark` class must toggle every surface.
- Size buttons by their container, not by their label — `14px 36px` padding with `160px` minimum for marketing pills gives every CTA commanding presence regardless of text length.

### Don't
- Don't bump display weight above 300 — at 500 the brand's editorial air collapses.
- Don't add new accent colors outside the documented palette (sky-blue / deep navy / ruby / magenta / cream).
- Don't use the sky-blue `{colors.primary}` as a body-text color — it's a CTA and link color, not a type color at body size.
- Don't let button padding shrink below `14px 36px` on marketing pills or `12px 28px` on dashboard — tight padding makes buttons feel like afterthoughts.
- Don't render money cells without `tnum` — it breaks the quiet financial-data signature.
- Don't replace the pill shape with rounded-rectangles for marketing buttons (dashboard buttons may use radius-lg).
- Don't mix legacy indigo and sky-blue CTAs in the same section — prefer sky-blue going forward.
- Don't define buttons by their label length — define them by their intended footprint; generous dimensions are the brand's signal of confidence.

## Responsive Behavior

### Breakpoints

| Name | Width | Key Changes |
|---|---|---|
| Wide | ≥ 1440px | Full gradient mesh edge-to-edge; dashboard composite at full scale |
| Desktop | 1024–1440px | Default content max-width; pricing 4-up |
| Tablet | 768–1023px | Pricing 2-up; dashboard composite simplifies to 2 panels |
| Mobile | < 768px | Pricing 1-up; sidebar becomes slide-in overlay; display drops 56 → 36px |

### Touch Targets
- Pill buttons hit ≥ 40×40px on mobile via padding scaling. On smaller screens, buttons size up to 44×44px to maintain WCAG AAA.
- Form fields stay at 40px minimum height.
- Mobile nav sidebar: full-height overlay with `sidebar-slide-in` / `sidebar-slide-out` animations.

### Collapsing Strategy
- Display tiers stair-step 56 → 48 → 32 → 26 → 22px through the breakpoints.
- Gradient mesh re-tiles on mobile to preserve the wash without disappearing.
- Dashboard composites simplify to single-panel mockups on mobile; the multi-layer composition only renders at desktop+.
- Pricing tiers stair-step 4-up → 2-up → 1-up.
- Sidebar collapses to icon-only or overlay on tablet/mobile.

### Image Behavior
Product UI composites use `srcset` with art-direction crops at major breakpoints. Mobile crops focus on the most actionable inner panel; desktop crops show the full multi-layer composition.

## Animations

| Animation | Duration | Easing | Use |
|---|---|---|---|
| `animate-blob-float` | 12s | ease-in-out | Gradient mesh blobs |
| `animate-blob-float-2` | 15s | ease-in-out | Gradient mesh blobs (alternate) |
| `animate-blob-pulse` | 6s | ease-in-out | Gradient mesh blob opacity |
| `animate-mesh-reveal` | 1.2s | cubic-bezier(0.16,1,0.3,1) | Mesh entrance on page load |
| `hero-line-1/2/3` | 0.7s | cubic-bezier(0.16,1,0.3,1) | Hero text stagger entrance |
| `hero-mockup` | 0.9s | cubic-bezier(0.16,1,0.3,1) | Hero mockup scale-in |
| `stagger-1` through `stagger-6` | 0.6s | cubic-bezier(0.16,1,0.3,1) | Section reveal on scroll |
| `animate-fade-in` | 0.2s | cubic-bezier(0.4,0,0.2,1) | Generic entrance |
| `animate-slide-in` | 0.3s | cubic-bezier(0.4,0,0.2,1) | Generic slide |
| `animate-logo-fade` | 0.6s | ease-out | Logo entrance |
| `animate-logo-dot` | 1.4s | ease-in-out | Logo dot pulse |
| `animate-marquee` | 40s | linear | Customer logo strip scroll |
| `animate-float` | 6s | ease-in-out | Floating UI elements in hero |
| `animate-shimmer-bar` | 2s | ease-in-out | Progress bar shimmer |
| `animate-breath` | 3s | ease-in-out | Status indicator pulse |
| `sidebar-slide-in` | 0.4s | cubic-bezier(0.16,1,0.3,1) | Mobile sidebar open |
| `sidebar-slide-out` | 0.3s | cubic-bezier(0.16,1,0.3,1) | Mobile sidebar close |

**Signature easing:** `cubic-bezier(0.16, 1, 0.3, 1)` — an ease-out-expo curve used across hero entrances, sidebar animations, and mesh reveals. Defined as `ease-out-expo` in the Tailwind config.

## Iteration Guide

1. Focus on ONE component at a time.
2. Reference component names and tokens directly (`{colors.primary}`, `{button-primary-pill}`, `{rounded.pill}`).
3. Prefer sky-blue (`#0EA5E9`) over legacy indigo (`#533afd`) for new components.
4. Default body to `{typography.body-md}` (15px); use `{typography.body-tabular}` for any money / numeric cell.
5. Apply `ss01` globally on the body; apply `tnum` per-element on numeric content.
6. The gradient mesh is non-negotiable on marketing heroes — bare-canvas heroes break the brand.
7. Dashboard components use `--primary` CSS variable (shadcn convention); marketing uses `bg-[color_var]` directly.
8. Billing theme (`/billing/*`) requires `.billing-theme` class on root to activate emerald palette.
9. Dark mode: all new dashboard components must render correctly under `.dark` — test both themes.
