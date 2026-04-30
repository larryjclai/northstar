---
name: northstar
description: Privacy-first wealth tracking for Apple platforms.
colors:
  app-bg-dark: "#11161A"
  app-bg-light: "#F7F9F8"
  surface-dark: "#171D22"
  surface-light: "#FFFFFF"
  surface-raised-dark: "#20282E"
  surface-raised-light: "#EDF2F0"
  border-dark: "#334047"
  border-light: "#D7E0DD"
  text-primary-dark: "#F0F4F2"
  text-primary-light: "#1B2421"
  text-secondary-dark: "#A8B5B0"
  text-secondary-light: "#65736F"
  accent: "#6BE4C9"
  accent-strong: "#2FB89F"
  growth: "#62D98A"
  risk: "#F06F74"
  warning: "#E5B95C"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Display, system-ui, sans-serif"
    fontSize: "34"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "normal"
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Display, system-ui, sans-serif"
    fontSize: "24"
    fontWeight: 700
    lineHeight: 1.16
    letterSpacing: "normal"
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, system-ui, sans-serif"
    fontSize: "17"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "normal"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, system-ui, sans-serif"
    fontSize: "15"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, system-ui, sans-serif"
    fontSize: "12"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "normal"
rounded:
  sm: "6"
  md: "10"
  lg: "16"
spacing:
  xs: "4"
  sm: "8"
  md: "12"
  lg: "16"
  xl: "24"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.app-bg-dark}"
    rounded: "{rounded.md}"
    padding: "12 16"
  button-secondary:
    backgroundColor: "{colors.surface-raised-dark}"
    textColor: "{colors.text-primary-dark}"
    rounded: "{rounded.md}"
    padding: "12 16"
  card:
    backgroundColor: "{colors.surface-dark}"
    textColor: "{colors.text-primary-dark}"
    rounded: "{rounded.lg}"
    padding: "16"
---

# Design System: northstar

<!-- SEED -->

## 1. Overview

**Creative North Star: "The Quiet Navigation Instrument"**

northstar should feel like opening a precise instrument panel after the market has calmed down: clear totals, legible movement, and enough warmth that users want to come back. The UI serves the task. It should be native, focused, and tactile without becoming playful in moments where trust matters.

The default register is product. The product borrows Copilot Money's clarity and Robinhood's satisfying native momentum, but rejects broker terminals, spreadsheet trackers, crypto neon, generic navy-and-gold finance, and promotional bank-app clutter.

**Key Characteristics:**
- Local-first and privacy-forward.
- Calm dark mode as the primary mood, with a polished light mode.
- Progressive detail: overview first, explainable math on demand.
- Native Apple typography, tabular figures, Dynamic Type support.
- Semantic color roles inspired by Radix UI Colors usage rules.

## 2. Colors

The palette uses a Radix-inspired 1-12 semantic ramp translated into SwiftUI design tokens. The app should use tinted neutrals for structure, a rare aurora accent for primary action and selection, and separate semantic tones for growth, risk, and warning.

### Primary
- **Aurora Mint** (`#6BE4C9`): Primary action, selected state, active navigation, important focus treatments. Use sparingly so it remains meaningful.
- **Deep Aurora** (`#2FB89F`): Pressed states, compact active indicators, and charts where the primary accent needs stronger contrast.

### Secondary
- **Growth Green** (`#62D98A`): Positive return and favorable portfolio movement. Pair with icons, labels, or signs so color is not the only signal.
- **Risk Coral** (`#F06F74`): Loss, risk, destructive confirmation, and negative movement. Avoid flooding large regions with this color.
- **Signal Amber** (`#E5B95C`): Stale prices, import warnings, missing exchange rates, or data that needs review.

### Neutral
- **Polar Ink** (`#11161A`): Dark app background.
- **Night Surface** (`#171D22`): Default grouped surface in dark mode.
- **Raised Graphite** (`#20282E`): Hover, selected containers, and elevated panels.
- **Mist Paper** (`#F7F9F8`): Light app background.
- **Snow Surface** (`#FFFFFF`): Light raised surfaces.
- **Line Ash** (`#334047` dark, `#D7E0DD` light): Separators, dividers, and focus boundaries.

### Named Rules

**The Radix Step Rule.** Map color usage by semantic intensity: step 1 app background, 2 subtle background, 3 element background, 4 hover background, 5 active or selected background, 6 subtle separator, 7 border and focus ring, 8 hover border, 9 solid accent, 10 solid accent hover, 11 low-contrast text, 12 high-contrast text.

**The Rare Star Rule.** The aurora accent should usually stay below 10 percent of a screen. It marks direction, not decoration.

## 3. Typography

**Display Font:** SF Pro Display via the Apple system stack.
**Body Font:** SF Pro Text via the Apple system stack.
**Label/Mono Font:** SF Mono only for technical identifiers, CSV previews, and debugging-like data surfaces.

**Character:** Typography should feel native, numerical, and quiet. Use weight and alignment more than decorative type choices.

### Hierarchy
- **Display** (700, 34pt, 1.1): Net worth, portfolio value, and major screen-level totals.
- **Headline** (700, 24pt, 1.16): Screen headings and portfolio section titles.
- **Title** (600, 17pt, 1.25): Card headers, asset names, and form section headings.
- **Body** (400, 15pt, 1.4): Explanatory copy, transaction notes, and list metadata.
- **Label** (600, 12pt, 1.25): Time ranges, chips, table labels, and compact captions.

### Named Rules

**The Tabular Trust Rule.** Monetary values, percentages, and quantities should use tabular figures where available.

## 4. Elevation

northstar should use tonal layering before shadows. Dark mode depth comes from background steps, spacing, and subtle borders. Shadows can appear on macOS popovers, floating controls, and dragged elements, but routine cards should remain grounded.

### Named Rules

**The Flat-At-Rest Rule.** Surfaces are flat until state requires feedback. Hover, drag, focus, and modal elevation can lift; static data should not float for decoration.

## 5. Components

### Buttons
- **Shape:** Rounded, native, and compact (10pt default radius).
- **Primary:** Aurora Mint background with dark text. Use for the one main action on a surface.
- **Hover / Focus:** Move to Deep Aurora or add a clear focus ring using the step 7 border role.
- **Secondary / Ghost:** Tonal raised background or transparent button with high-contrast text.

### Chips
- **Style:** Compact capsules for time range, currency, account scope, and benchmark selection.
- **State:** Selected chips use a step 5 background and step 12 text. Unselected chips use subtle step 3 background and step 11 text.

### Cards / Containers
- **Corner Style:** 16pt for major grouped content, 10pt for smaller controls.
- **Background:** Use the surface ramp, not arbitrary overlays.
- **Shadow Strategy:** No decorative shadows. Use tonal contrast and separators.
- **Border:** Thin separators only when hierarchy needs clarification.
- **Internal Padding:** 16pt default, 12pt for dense financial rows.

### Inputs / Fields
- **Style:** Native rounded fields with subtle background and visible focus.
- **Focus:** Accent or neutral focus ring that passes contrast.
- **Error / Disabled:** Error text and icon, not color alone. Disabled controls lower contrast but keep labels readable.

### Navigation
- Use native TabView and split navigation patterns where they fit the platform.
- iPhone should favor bottom tabs and drill-in detail.
- iPad and macOS should use a sidebar plus detail pane for portfolio, transactions, holdings, and settings.

## 6. Do's and Don'ts

Do make portfolio direction legible at a glance.
Do show timestamps, quote freshness, and currency context near financial values.
Do use semantic color tokens rather than one-off colors.
Do support Traditional Chinese first and keep English labels structurally ready.
Do respect Dynamic Type, Reduce Motion, and WCAG AA contrast.

Don't imitate a brokerage terminal.
Don't build a spreadsheet UI unless the user is explicitly importing or auditing records.
Don't use red or green as the only carrier of meaning.
Don't use neon crypto aesthetics, generic finance navy-and-gold, or decorative glass effects.
Don't put every metric inside identical cards.
