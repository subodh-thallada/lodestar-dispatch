---
name: Lodestar Dispatch
description: A freight dispatch console drawn as the motor carrier's road atlas; map paper, ink rules, road-hierarchy colour as the only semantic system.
colors:
  paper: "#efe9d8"
  paper-2: "#f8f5ec"
  paper-3: "#e4dcc5"
  paper-4: "#d9d0b6"
  ink: "#1b1915"
  ink-2: "#45413a"
  ink-3: "#6f6a5c"
  rule: "#cbc2a8"
  rule-2: "#a8a08a"
  white: "#ffffff"
  road: "#1d4f9e"
  road-ink: "#183f7d"
  road-soft: "#d7e1f3"
  red: "#c0392b"
  red-ink: "#9c2b20"
  red-soft: "#f3d9d5"
  green: "#2e7d4f"
  green-ink: "#23613d"
  green-soft: "#d6e8dc"
  yellow: "#e6c35a"
  yellow-ink: "#7d5f12"
  yellow-soft: "#f6e9bd"
  carbon: "#5b4b8a"
  carbon-ink: "#473a70"
  carbon-soft: "#dfd9ec"
typography:
  display:
    fontFamily: "Barlow Condensed, Barlow, ui-sans-serif, sans-serif"
    fontSize: "26px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.04em"
  headline:
    fontFamily: "Barlow Condensed, Barlow, ui-sans-serif, sans-serif"
    fontSize: "21px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.03em"
  title:
    fontFamily: "Barlow Condensed, Barlow, ui-sans-serif, sans-serif"
    fontSize: "17px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.08em"
  figure:
    fontFamily: "Barlow Condensed, Barlow, ui-sans-serif, sans-serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "normal"
  identifier:
    fontFamily: "Barlow Condensed, Barlow, ui-sans-serif, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.04em"
  body:
    fontFamily: "Barlow, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.375
    letterSpacing: "normal"
  caption:
    fontFamily: "Barlow, ui-sans-serif, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: "normal"
  label:
    fontFamily: "Barlow Condensed, Barlow, ui-sans-serif, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.08em"
rounded:
  none: "0px"
  focus: "2px"
spacing:
  hair: "2px"
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  2xl: "32px"
components:
  button-neutral:
    backgroundColor: "{colors.paper-2}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "0 14px"
    height: "36px"
  button-neutral-hover:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
  button-good:
    backgroundColor: "{colors.green}"
    textColor: "{colors.white}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "0 14px"
    height: "36px"
  button-good-hover:
    backgroundColor: "{colors.green-ink}"
    textColor: "{colors.white}"
  button-accent:
    backgroundColor: "{colors.carbon}"
    textColor: "{colors.white}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "0 14px"
    height: "36px"
  button-accent-hover:
    backgroundColor: "{colors.carbon-ink}"
    textColor: "{colors.white}"
  button-info:
    backgroundColor: "{colors.road}"
    textColor: "{colors.white}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "0 14px"
    height: "36px"
  button-info-hover:
    backgroundColor: "{colors.road-ink}"
    textColor: "{colors.white}"
  button-bad:
    backgroundColor: "{colors.paper-2}"
    textColor: "{colors.red-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "0 14px"
    height: "36px"
  button-bad-hover:
    backgroundColor: "{colors.red-soft}"
    textColor: "{colors.red-ink}"
  button-warn:
    backgroundColor: "{colors.yellow}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "0 14px"
    height: "36px"
  button-warn-hover:
    backgroundColor: "{colors.yellow-soft}"
    textColor: "{colors.ink}"
  button-sm:
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "0 10px"
    height: "28px"
  seg-tab:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink-2}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "4px 10px"
  seg-tab-hover:
    backgroundColor: "{colors.paper-3}"
    textColor: "{colors.ink}"
  seg-tab-selected:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper-2}"
  tag:
    backgroundColor: "transparent"
    textColor: "{colors.ink-2}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "0 6px"
    height: "18px"
  stamp:
    backgroundColor: "transparent"
    textColor: "{colors.ink-2}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "3px 8px"
  panel-ruled:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "12px 4px"
  panel-boxed:
    backgroundColor: "{colors.paper-2}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "16px"
  input-amount:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "0 8px"
    height: "36px"
  select:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "0 8px"
    height: "28px"
  nav-tab:
    backgroundColor: "{colors.paper-3}"
    textColor: "{colors.ink-3}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "16px 0"
    width: "88px"
  nav-tab-hover:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
  nav-tab-active:
    backgroundColor: "{colors.paper-2}"
    textColor: "{colors.ink}"
  toast:
    backgroundColor: "{colors.paper-2}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "12px"
    width: "352px"
---

# Design System: Lodestar Dispatch

## Overview

**Creative North Star: "The Road Atlas"**

The console is the motor carrier's road atlas laid open on the desk. The page is buff map paper carrying a faint 32px coordinate grid and a fractal-noise tooth; everything printed on it is ink. Sections are not boxes but regions headed by a rule, the way an atlas separates a mileage table from a city inset. The single kind of box the system draws is the atlas' own inset or legend frame: a hairline ink border on lighter paper. Colour is never decoration. It is the road hierarchy of a printed map, borrowed as the semantic system: interstate blue for the primary action and loaded miles, highway red for urgent and negative, route green for accept, urban yellow for caution and empty miles, carbon purple for bids and soft locks. Each hue exists in exactly three strengths (fill, ink, soft tint) and nothing else is coloured.

The voice is Barlow Condensed in capitals for every label, column head, tab, identifier and heading, with Barlow regular carrying running prose and body data. Numerals are tabular and lining everywhere, set at the root. Decisions land as rubber stamps: a thick border, uneven ink coverage from a turbulence mask, laid down two degrees off-square and multiplied into the paper. Nothing disappears when a decision is made; the entry prints in grayscale and stays in its column until the board retires it. Density is high and operational: 13px body, 11px labels, rows separated by hairlines, a fore-edge index-tab rail for navigation. The build rejects the dark ops console with neon accents; there is no dark surface anywhere in the system.

**Key Characteristics:**
- Buff paper ground with grid and tooth; light scheme only, no dark surfaces.
- Hairline ink rules in place of boxes; 2px ink rule opens a section, 1px rule divides rows.
- Six-tone semantic colour (neutral, good, bad, warn, info, accent) mapped to road hierarchy; every hue in fill / ink / soft strengths.
- Barlow Condensed capitals for labels and headings; Barlow for prose; tabular lining numerals throughout.
- Square geometry: 0px radius on every drawn element.
- Flat ink on paper; only the floating toast lifts.
- Stamps as state; stamped and expired entries print in grayscale at 55% opacity instead of leaving.
- Route shields mark load type; an 88px fore-edge tab rail carries navigation.

## Colors

A warm buff paper with near-black ink, and five map-road hues each in three strengths; the hue speaks for a meaning, never for a brand.

### Primary
- **Interstate Blue** (`road`): the primary action (`Apply policy`), the booked lane on the map (2.4px cased road), the loaded segment of a lock bar, the busy share of a utilization bar, selection rings, focus outline, caret, range and checkbox accent, and `::selection`. The expiry rule starts in this colour while more than half the window remains.
- **Interstate Blue Ink** (`road-ink`): the hover fill of the info button, the text of info tags and figures, the "more" disclosure link, info-level forecast lines.
- **Interstate Blue Soft** (`road-soft`): the selected row tint of the terminal table, at 50% alpha.

### Secondary
- **Route Green** (`green`) / **Route Green Ink** (`green-ink`): accept and positive. The filled ACCEPT button, the `Booked` stamp, the open-load route hint on the map (dashed 1px), positive margin text, passed guardrails, the live/good legend dot, the calibration "actual" tick. The soft tint (`green-soft`) is defined in the token set but not drawn in the current build.
- **Highway Red** (`red`) / **Highway Red Ink** (`red-ink`) / **Highway Red Soft** (`red-soft`): urgent and negative. The `Declined` stamp, negative margin, failed non-overridable guardrails, the last 20% of the expiry rule, the countdown under 60 seconds, the "now" line in the driver's log, critical hub fill (`red-soft`) and ring (`red`), the north point of the mark. The bad button is outlined red ink on paper and tints to `red-soft` on hover; it is never filled red.
- **Urban Yellow** (`yellow`) / **Urban Yellow Ink** (`yellow-ink`) / **Urban Yellow Soft** (`yellow-soft`): caution, hold and empty miles. The deadhead segment of a lock bar and the deadheading unit marker on the map, the `Hold` stamp, overridable failed guardrails, the override checkbox, warning hub fill and ring, the sim speed readout when faster than real time, the network tab's warning count badge, the middle band of the expiry rule.
- **Carbon Purple** (`carbon`) / **Carbon Purple Ink** (`carbon-ink`) / **Carbon Purple Soft** (`carbon-soft`): bids and soft locks. The filled SUBMIT BID button, the `Bid in` stamp, the outstanding-bid dashed arc on the map (1.6px, 6 4 dash), the soft-lock bar in the driver's log (dashed carbon border over `carbon-soft` at 40%), the auto-pilot actor tag, the P(win) figure, the `chain` tag.

### Neutral
- **Map Paper** (`paper`): the page. Also the default fill of the map field, the Seg control, inputs and selects, and the hover tint on table rows.
- **Inset Paper** (`paper-2`): lighter paper for anything printed on top of the page: boxed panels, neutral buttons, the toast, the active index tab, the map page margin and legend, the inverted text on an ink-filled tab, the casing stroke around a drawn road.
- **Shelf Paper** (`paper-3`): the index-tab rail and the empty track of every bar (expiry rule, utilization, progress, calibration). Hover tint on Seg and speed controls.
- **Worn Paper** (`paper-4`): the turnaround segment of a lock bar, the out-of-service share of utilization, the map hatch pattern.
- **Ink** (`ink`): headings, figures, body text, the 2px section rule, the selected Seg tab fill, the active tab count badge, hub rings and unit markers on the map, the boxed panel border (at 80% alpha).
- **Ink 2** (`ink-2`): secondary data, subtitles in tables, Seg and legend text, neutral tag and stamp text, toast detail.
- **Ink 3** (`ink-3`): all labels and column heads, meta rows, muted figures, idle tab text, grid coordinates on the map, the arrow between cities.
- **Rule** (`rule`): the hairline. Section header underlines, row dividers (at 70% alpha in tables), the economics table borders, the lock-bar hour grid, the coordinate grid on the map (0.6px), the toast border.
- **Rule 2** (`rule-2`): the firmer hairline for drawn controls: Seg, input, select and speed-group borders, the dashed empty-state border, the neutral tag border, the scrollbar thumb, the US outline on the map, reason-list chevrons.
- **White** (`white`): text on filled good / info / accent buttons and the BIN shield legend only.

### Named Rules
**The Road-Hierarchy Rule.** Colour carries meaning and nothing else. Six tones (`neutral`, `good`, `bad`, `warn`, `info`, `accent`) map to paper-ink, green, red, yellow, road blue and carbon purple; every coloured element in the build takes its colour from one of those six, and no hue appears outside its meaning.

**The Three-Strength Rule.** Every hue exists as a fill (`road`), an ink (`road-ink`) and a soft tint (`road-soft`). Fills are for filled buttons, bars, stamps and map strokes; inks are for text and hover fills; softs are for row tints and hover tints on outlined controls. Do not mix strengths across those roles.

**The Action-Colour Rule.** A filled colour button is the primary action of its entry and nothing else: green ACCEPT, carbon SUBMIT BID, road APPLY POLICY. Every other button is paper with a rule border (`neutral`) or outlined red ink (`bad`). Yellow fill is reserved for the warn tone and is not used as a button in the current build.

## Typography

**Display Font:** Barlow Condensed (with Barlow, ui-sans-serif fallback), weights 500 / 600 / 700, self-hosted via @fontsource
**Body Font:** Barlow (with ui-sans-serif, system-ui fallback), weights 400 / 500 / 600, self-hosted via @fontsource
**Label/Mono Font:** none; tabular lining numerals (`tnum`, `lnum`) are set at the root and reasserted by the `.num` helper on every data column.

**Character:** One family in two widths. The condensed cut in capitals does the work of a map's typography (lettered labels, route numbers, place names) and the regular cut carries the dispatcher's reasons and subtitles at a small operational size. Tracking widens as the size shrinks: 0.03em at 21px, 0.08em at 17px and at 11px, 0.12–0.16em on the wordmark and large stamps.

### Hierarchy
- **Display** (700, 26px, line-height 1, 0.04em): the sim clock readout in the masthead and the large decision stamp (26px, 0.16em). The 22px wordmark (0.12em) and 22px KPI figures sit a step under it.
- **Headline** (700, 21px, line-height 1, 0.03em, uppercase): the lane on each route-log entry (`ORIGIN, ST → DESTINATION, ST`).
- **Title** (700, 17px, 0.08em, uppercase): every section heading, with the count in `ink-3` beside it; the panel subtitle under it is 12px Barlow in `ink-3`.
- **Figure** (700, 22px / 20px / 18px / 15px, line-height 1, tabular): numbers that are read, not scanned: KPI strip 22px, auto-pilot counters 20px, economics cells 18px, policy field values and the countdown 15px.
- **Identifier** (600, 14px or 13px, 0.04–0.06em, uppercase, condensed): load ids, lane ids, unit numbers, hub codes in tables and ledgers. 15px/700 for the hub code in the terminal table.
- **Body** (400, 13px, line-height 1.375): reasons, table cells, ledger lines, policy copy. 14px (`text-sm`) only in empty states and the "clear" forecast line.
- **Caption** (400, 11px or 12px): sub-figures, miles under a lane, meta under a unit, model notes; always `ink-3`.
- **Label** (600, 11px, 0.08em, uppercase, line-height 1, `ink-3`): the `.label` class. Every column head, field label, KPI label, footer line and tab-rail caption. Variants at 12px/0.06em (tags at 11px, Seg, guardrails, inline buttons and legends), 12px/0.1em (tab rail), 13px/0.08em (buttons).

### Named Rules
**The Condensed-Caps Rule.** Anything that names, labels, heads or identifies is Barlow Condensed in uppercase with tracking. Anything that explains is Barlow regular in sentence case. There is no third voice.

**The Tabular Rule.** Every number is tabular and lining. Columns of figures must align without effort; `.num` goes on any container holding data.

## Layout

The page is a single scrolling column to the right of a fixed index-tab rail. On `md` (768px) and up the rail is 88px wide, full-height, sticky, with its tab list starting 104px down so the tabs sit below the masthead's height; below `md` the rail becomes a horizontal strip across the top with five equal tabs. The masthead is sticky at the top on `md`+ and is a wrapping flex row of groups separated by 1px left rules: mark and wordmark, clock and speed control, legend dots, and the demo helper button pushed to the right. Main content has 16px padding (24px horizontal at `lg`) and 16px vertical rhythm between sections.

Section spacing is a 16px gap between panels (`gap-4`), 20px between the board's filter row, columns and active table (`space-y-5`), and 32px / 24px between the two ruled load columns, which lock to two columns at `xl` (1280px) and stack below it. Ruled panels keep a 4px horizontal gutter so their content aligns to the rule's ends; boxed panels and tables pad 16px. Table cells are `py-2 pr-3` (8px / 12px) with a 16px leading edge; row dividers are hairlines. The economics table on an entry is six cells on `sm`+ and three-by-two below it, with the second row taking a top rule instead of left rules. The KPI strip is one ruled line, 2px ink above and below, eight figures at `xl`, four at `sm`, two below.

Breakpoints are Tailwind's defaults and only `sm` 640, `md` 768, `lg` 1024 and `xl` 1280 are used. The driver's log keeps a 760px minimum width and scrolls horizontally; the map is an SVG with a 960×560 viewBox that scales to its panel width. The toast stack is fixed bottom-right, 22rem wide, capped at viewport minus 2rem.

**The Rule-Not-Box Rule.** A section opens with a 2px ink rule and a ruled header; its rows divide with 1px hairlines; it never closes with a bottom border or a side border. The only full boxes are the atlas insets: the boxed panel variant, the map's legend, the toast, and the drawn controls (Seg, input, select, speed group), which are outlined in `rule-2`.

## Elevation & Depth

Flat ink on paper. Depth is conveyed by paper tone (`paper-3` rail behind `paper-2` active tab behind the `paper` page; `paper-2` insets on the `paper` field), by the weight of the rule (2px ink opens, 1px rule divides, 0.6px grid recedes), and by the stamp's multiply blend sinking into the page. The system defines two shadows and the build draws exactly one of them: the toast, which floats over the page, takes `lift`. Nothing at rest casts a shadow; hover never adds one.

### Shadow Vocabulary
- **Lift** (`box-shadow: 0 2px 0 rgba(27,25,21,0.06), 0 14px 28px -14px rgba(27,25,21,0.4)`): the floating toast only.
- **Slip** (`box-shadow: 0 1px 0 rgba(27,25,21,0.08), 0 6px 14px -8px rgba(27,25,21,0.35)`): defined as a lighter lift for a surface that sits just off the page; not drawn anywhere in the current build.

### Named Rules
**The Flat-Ink Rule.** Surfaces on the page never cast a shadow. Only a surface that is physically off the page (the toast) may lift, and it lifts with `lift`.

**The Multiply Rule.** Stamps sit in the paper, not on it: `mix-blend-mode: multiply`, a turbulence mask for uneven coverage, a 2° counter-rotation, and no bevel, blur or glow.

## Shapes

Square. Every drawn element has a 0px radius: buttons, tags, stamps, Seg tabs, inputs, selects, panels, bars, the toast, the count badges. The only curves are the 2px radius the focus outline takes, the pill scrollbar thumb, the 8px legend dot, the hub circles on the map, and a 1px corner on the 10×7 unit marker. Borders are hairlines: 1px `rule` for division, 1px `rule-2` for drawn controls, 2px `ink` for a section rule, 2–3px tone for a stamp. Emphasis never comes from thickness beyond those four weights. Lines on the map follow a cartographic grammar: a booked lane is a cased road (5px paper-2 under 2.4px road with an arrowhead), a bid is a 1.6px carbon dash (6 4), an open-load hint is a 1px dash (2 4), a selection ring is a 1.5px road dash (3 3).

**The Shield Rule.** Load type is marked by a route shield, not a tag: the interstate shield (road fill, red crown, white BIN) for Book-It-Now, the US-route shield (paper fill, ink stroke, ink BID) for open bids. Shields are 34×30px on an entry and 27×24px in a column heading.

## Components

### Buttons
Printed controls: condensed capitals in a hairline frame, pressed into the paper by a 1px translate.
- **Shape:** square (0px); 1px border in the tone's ink; 36px tall, 14px horizontal padding, 13px/700/0.08em (`md`); 28px tall, 10px padding, 12px (`sm`).
- **Neutral:** paper-2 fill, rule-2 border, ink text; hover darkens the border to ink-2 and the fill to paper.
- **Good / Accent / Info:** filled green / carbon / road with the matching ink as border and white text; hover fills with the ink. These are the only filled buttons and each is a primary action.
- **Bad:** outlined red ink on paper-2; hover tints to red-soft. Never filled.
- **Warn:** yellow fill, yellow-ink border, ink text; hover to yellow-soft. Defined, not placed in the current build.
- **Hover / Focus / Active:** 150ms ease-out on background, colour, border and transform; `:active` translates down 1px; focus-visible is the global 2px road outline at 2px offset. Disabled drops to 40% opacity with `not-allowed` and no press.
- **Icons:** Lucide stroke icons at 12–14px inside buttons, 16px in toasts, 18px in the tab rail; stroke 3 on check and x marks.

### Chips
- **Tag:** 18px tall, transparent, 1px border and text in the tone's ink (`rule-2`/`ink-2` for neutral; `yellow-ink` at 60% border for warn), 6px padding, 11px/600/0.06em condensed caps. Status, actor, outcome, phase and `chain`/`overweight` flags.
- **Legend:** an 8px dot in the tone's fill colour beside 12px/600 condensed caps in `ink-2`; the good dot pulses when the feed is live. The masthead's status vocabulary.
- **Seg (segmented control):** index tabs on a rule. 1px `rule-2` frame on `paper`, tabs divided by 1px `rule-2`, 12px/600/0.06em caps in `ink-2`, 4px × 10px padding; hover `paper-3`; selected inverts to ink fill with `paper-2` text. Also drawn by hand as the speed group in the masthead (12px/700, tabular).

### Cards / Containers
- **Ruled panel (default):** 2px ink top rule; header with 17px title and 12px subtitle, underlined by a 1px rule, 12px top and 10px bottom padding, 4px gutters; body `px-1 py-3`, or `p-0` when it holds a table.
- **Boxed panel:** 1px ink border at 80% on `paper-2`, 16px padding. The inset / legend frame; the one box the atlas prints.
- **Route-log entry (LoadCard):** not a card. Entries divide with 1px rules inside a ruled column. Each opens with a 3px expiry rule on a `paper-3` track that drains left-to-right over the load's TTL, road above 50%, yellow to 20%, red below, animating width at 500ms linear. Header: shield, 21px lane headline with an `ink-3` arrow, flag tags, 11px label meta line; recommendation stamp (md) and 15px countdown on the right. Economics: six ruled cells (label, 18px figure, 11px sub). Guardrails as 12px condensed caps with check/x. Reasons as 13px body with `rule-2` chevrons, two shown, the rest behind a `road-ink` disclosure. Footer: top rule, 12px, actions left, override checkbox or fatal note right. Once stamped or expired the whole entry goes `grayscale` at 55% opacity over 500ms and stays in place for 45 seconds after the board retires it; the lg stamp presses in over the centre.
- **Toast:** `paper-2`, 1px `rule` border, 2px top rule in the kind's fill (green / red / yellow / road), 12px padding, `lift` shadow, lay-down entrance. 14px/700/0.06em condensed title, 12px detail in `ink-2`, 16px Lucide icon in the kind's ink. 5s, 9s for errors.
- **Empty state:** dashed 1px `rule-2` rules above and below, 32px vertical padding, 14px `ink-2` line and 12px `ink-3` hint, centred.
- **Shadow Strategy:** see Elevation; only the toast lifts.

### Inputs / Fields
- **Amount input:** 36px tall, 1px `rule-2` border on `paper`, 8px padding, 16px/700 condensed tabular, a `$` prefix in `ink-3`; the frame's border turns `road` on focus-within; no inner outline.
- **Select:** 28px tall, 1px `rule-2` on `paper`, 12px/600/0.06em condensed caps.
- **Range / Checkbox:** native controls with `accent-color: road` (range track 2px tall); the override checkbox takes `yellow-ink`. A policy field is a ruled row (`px-4 py-2.5`, bottom rule) with the `.label` left and the 15px/700 value right, the range beneath.
- **Error / Disabled:** disabled inputs and buttons fall to 40% opacity; a non-overridable failure is spoken as 12px red-ink condensed caps in the footer, not drawn as a red field.

### Navigation
- **Index-tab rail:** 88px wide, `paper-3`, 1px `rule` right border, sticky full height on `md`+. Each tab is a column of an 18px Lucide icon and a 12px/700/0.1em condensed caption in `ink-3`, 16px vertical padding; hover `paper` and `ink`. The active tab is `paper-2` with 1px `rule` rules above and below and a 1px negative right margin so it reads as joined to the page, and a 4px vertical bar on its left edge in the section's colour (board road, map green, log yellow, auto carbon, data red). A count badge sits top-right as 10px/700 tabular on an ink fill with `paper-2` text, or yellow with ink text for warnings. Below `md` the rail is a top strip with the colour bar across the top of the active tab.
- **Masthead:** 22px/700/0.12em wordmark over an 11px `.label` descriptor beside the mark; groups divided by 1px `rule` left borders. Sticky on `md`+, `paper`, 1px bottom rule.

### Stamp
The system's decision signature. Condensed 700 capitals in a thick border and text of the tone's fill colour (`green` for Booked, `red` for Declined, `carbon` for Bid in, `yellow-ink` for Hold, `ink-2` for neutral and Expired), masked by a 120px turbulence tile for uneven ink, `mix-blend-mode: multiply`, rotated -2°. Sizes: sm 2px border / 12px / 0.12em; md 2.5px / 15px / 0.14em; lg 3px / 26px / 0.16em. `pressed` plays `stamp-press` once (260ms, from scale 1.6 to 0.96 to 1, ease-stamp). Used on every entry's recommendation, on the entry once decided, and on each ledger line's action.

### Atlas Map
An SVG page: `paper-2` margin, `paper` field with a 1px ink frame, 10×6 lettered and numbered coordinate grid in 0.6px `rule` with 10px/600 `ink-3` coordinates in the 18px margin, a `rule-2` US outline on `paper-2`. Hubs are circles sized by free units (9px + 1.4px per unit), `paper-2` fill with an ink ring, `yellow-soft`/`yellow-ink` for warning and `red-soft`/`red` for critical, a 13px/700 code above and a 10.5px/600 count below; a selected hub gets a dashed road ring. Units are 10×7 ink rectangles, yellow when deadheading. The legend is a boxed inset bottom-left.

### Bars
Hairline-thin data bars on a `paper-3` track with no radius: 6px tall (`Bar`, lane volume), 8px (terminal utilization, stacked road / carbon / yellow / green-70 / paper-4), 12px (calibration, road at 70% with a 2px green tick), 3px (expiry rule). Width animates 300ms ease-out, 500ms linear for the expiry rule.

### Motion
Three animations and one easing. `lay-down` (240ms, from -6px and transparent) on every entry, ledger line and toast as it is printed; `stamp-press` (260ms) on a decision; `ink-tick` (1200ms yellow-soft fade) defined for a row that just changed, not currently applied. Everything eases with `cubic-bezier(0.16, 1, 0.3, 1)`; colour and transform transitions are 150ms. `prefers-reduced-motion` removes all three animations and collapses transitions to 0.01ms.

## Do's and Don'ts

### Do:
- **Do** open a section with a 2px ink top rule and a ruled header; divide its rows with 1px `rule` hairlines; leave it open at the bottom.
- **Do** take every colour from one of the six tones, and use the fill for bars, stamps and filled buttons, the ink for text and hover, the soft for tints.
- **Do** set every label, head, tab and identifier in Barlow Condensed capitals with tracking (11px / 0.08em default) and every number tabular and lining.
- **Do** land a decision as a stamp and leave the entry printed in grayscale at 55% opacity; nothing disappears, it cancels.
- **Do** keep geometry square (0px) and borders at the four weights: 0.6px grid, 1px rule, 2px section rule, 2–3px stamp.
- **Do** mark load type with the route shield, and give the primary action of an entry the only filled colour button in it.
- **Do** build the lighter paper (`paper-2`) for anything printed on top of the page and the darker (`paper-3`) for anything the page rests on.

### Don't:
- **Don't** draw a box around a section; the only boxes are the atlas insets (boxed panel, map legend, toast) and the drawn controls.
- **Don't** cast a shadow on anything that sits on the page; only the floating toast takes `lift`.
- **Don't** fill a button red; the bad button is outlined red ink and tints to `red-soft`.
- **Don't** round a corner beyond the 2px focus outline, or use a pill, except the scrollbar thumb and the legend dot.
- **Don't** introduce a dark surface, a neon accent, a gradient fill or a glow; the scheme is light paper and ink only.
- **Don't** mark state with icons alone; a tone's colour carries it, a stamp or tag names it.
- **Don't** use colour for brand or decoration; a hue that appears outside its meaning breaks the road hierarchy.
