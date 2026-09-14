# Ludhiana Park Adoption Portal

Official park & green-belt adoption portal of **Municipal Corporation Ludhiana**.

Publishes MCL's register of 918 parks and green belts, allowing both **statutory
CSR corporate partners** (Section 135) and **non-CSR business entities**
(MSMEs, local enterprises, trade chambers, merchant associations, trusts and RWAs)
to explore sites by zone, ward, type and adoption status, read comprehensive municipal asset
dossiers, and file **Form CSR-1 (Adoption EOI)** online.

Static site — plain HTML5, CSS3 and ES6. No build step, no framework, no
dependencies to install.

---

## 1 · Project structure

| File | Purpose |
| --- | --- |
| `index.html` | Page structure, semantic markup, inline SVG icon sprite, SEO metadata |
| `style.css` | Design system and all layout, in 20 numbered sections (see below) |
| `script.js` | Application engine — filtering, search, sort, CSV export, Maps/GIS, dossier modal, Form CSR-1 |
| `motion.js` | Presentation-only motion layer — scroll reveals, stat count-up, hero parallax |
| `config.js` | **Deployment configuration** — Maps API key, recipient email |
| `parks_data.json` | The register: 918 sites with ward, authority, status, footfall, area, coordinates |
| `assets/` | MCL seal, Fast-Track theme photography, hero backdrop |
| `tools/` | One-off image optimisation scripts (Python + Pillow) |
| `_MCL_PARKS_DATA.xlsx` | Source spreadsheet `parks_data.json` was generated from |

`style.css` and `script.js` are both organised in the page's own reading order,
so a section of the page maps to one numbered block of each file:

```
hero → stats → process → registry → themes → impact → stewardship → GIS → footer
```

`motion.js` is deliberately separate and entirely optional. **Deleting it
leaves the portal fully functional** — every statistic shows its final value,
every section is visible, nothing becomes unreachable.

---

## 2 · Configuration (`config.js`)

```javascript
const GOOGLE_MAPS_API_KEY = "your-restricted-key-here";
const CONTACT_EMAIL = "horticulture@mcludhiana.gov.in";
```

**The API key in this file is public** — it is served as plain text to every
visitor. It must be restricted by HTTP referrer and by API in the Google Cloud
console, with a daily quota cap. `config.js` documents exactly what to set and
why. Read that before deploying.

If the key is empty, or present but rejected at runtime, the GIS panel shows a
clearly-labelled *pending activation* notice. Search, filters, sort, CSV export
and Form CSR-1 all remain fully operational.

---

## 3 · Local development

No tooling required — but `parks_data.json` is loaded with `fetch()`, so the
page must be served over HTTP rather than opened as a `file://` URL:

```bash
python -m http.server 8000
# then open http://127.0.0.1:8000
```

After changing `style.css`, `script.js` or `motion.js`, bump the `?v=` revision
string on that file's tag in `index.html` so returning visitors get the new
version.

---

## 4 · Deploy

No build step. Drag the folder onto [Netlify Drop](https://app.netlify.com/drop),
or push to a Git repository and link it.

**Form submissions.** `#interestForm` carries `data-netlify="true"` and a
matching hidden `form-name`, so submissions land in the Netlify Forms
dashboard. The portal also opens a pre-filled email draft to `CONTACT_EMAIL`.

> **Do not rename form fields.** The Form CSR-1 payload is a contract with the
> Netlify Forms dashboard and the Horticulture Cell mailbox. The submitted
> names are: `form-name`, `organization`, `entity_type`, `contact_name`,
> `designation`, `email`, `phone`, `site_of_interest`, `theme_concept`,
> `scope[]`, `budget_range`, `adoption_tenure`, `message`, plus
> `application_reference` and `is_priority_theme` appended at submit time.

---

## 5 · The register (918 sites)

| | |
| --- | --- |
| **Total sites** | 918 — 812 parks, 106 green belts |
| **Total green cover** | 546.5 acres (≈ 22,11,628 m²) |
| **Available for CSR adoption** | 266 (MCL self-managed) |
| **RWA managed** | 613 (co-development invited) |
| **Already adopted** | 39 (under corporate CSR agreement) |
| **Zones** | A 76 · B 232 · C 56 · D 554 |
| **Wards covered** | 74 |
| **Daily footfall** | High (200–500+) 48 · Medium (50–200) 278 · Local (0–50) 592 |

Every figure shown on the page is **computed at runtime from
`parks_data.json`**, not hard-coded, so the statistics band and impact panels
cannot drift from the data. The values in the markup are the same numbers,
present so the page is correct before JavaScript runs.

### Record schema

```json
{
  "id": "MCL_942", "name": "Anandpuri Tirkona Park", "category": "PARK",
  "zone": "A", "ward": 2, "area_sqm": 231.7,
  "lat": 30.940707, "lng": 75.856457,
  "authority": "MCL SELF MANAGED", "status": "Available",
  "footfall": "0-50", "contract_end": null, "condition": "Average"
}
```

`category` is `PARK` or `GREEN BELT`. `status` is `Available`, `RWA Managed` or
`Adopted`. `footfall` is one of `0-50`, `50-200`, `200-500+`. Renaming any of
these breaks filtering and CSV export.

**Data caveat:** `condition` is `"Average"` for all 918 records, so the
"Recorded condition" dossier row currently carries no distinguishing
information. The field is retained because the schema and the dossier layout
expect it; it becomes useful as soon as the Horticulture Wing records real
assessments.

---

## 6 · Fast-Track theme programme

MCL gives priority review and allotment to proposals featuring a notified
theme concept:

1. **Butterfly & Bird Sanctuary** — native nectar flora, larval host plants, bird baths and feeders, observation trails
2. **E-Waste & Recycled Art Eco-Park** — scrap/e-waste sculpture, solar smart benches, recycling kiosks
3. **Open-Air Reading & Knowledge Park** — reading gazebos, mini-book trees, study alcoves, solar reading lights
4. **Urban Miyawaki Micro-Forest** — high-density native plantation for carbon capture and microclimate cooling
5. **Senior Citizen Sensory & Wellness Park** — sensory tracks, medicinal beds, ergonomic benches, open-air physiotherapy
6. **Children's Eco-Science & Play Park** — timber playscapes, solar/water physics exhibits, discovery gardens

These are a full page section (`#themes`), not a modal — indexable, linkable
and reveal-animated. Each card opens Form CSR-1 with its theme pre-selected.

---

## 7 · Accessibility

Built to WCAG 2.1 AA.

- Every text and UI-boundary colour pair is contrast-validated. Body text is
  14.7:1; the weakest deliberate pair (muted small text on the recessed band)
  is 4.97:1. Form-field borders use a dedicated darker token (`--line-field`,
  3.1–3.6:1) because a control's bounds must clear 3:1 — decorative rules use
  the lighter `--rule`.
- Status is never colour-only: each badge carries a dot, a hue **and** a text
  label.
- Status filters are a `radiogroup` with roving tabindex and arrow-key
  navigation — not a `tablist`, since they have no tab panels.
- Result cards and table actions are real `<button>`s, so they are keyboard
  operable and announced as actions.
- The dossier modal traps Tab, closes on Escape, and restores focus to the
  element that opened it.
- All touch targets are ≥44px. Mobile inputs are 16px to prevent iOS
  focus-zoom.
- Icons are inline SVG with `aria-hidden`, always paired with text. (The
  previous build used emoji as sole icon content, which screen readers
  announce verbatim and which renders inconsistently across platforms.)

### Reduced motion

`prefers-reduced-motion: reduce` is honoured through a single authoritative
override (`style.css` §04) plus matching guards in `motion.js`. Parallax and
scroll reveals are disabled, counters resolve instantly to their final values,
and the page stays completely usable. The preference is also watched live, so
toggling it at the OS level takes effect without a reload.

---

## 8 · Performance notes

- **Progressive rendering.** The register renders 48 records at a time behind a
  "show more" control. Filtering, sorting and CSV export always run over the
  complete result set — only the DOM node count is capped. Rendering all 918
  cards on every keystroke previously pushed the document past ~7,000 nodes.
- **Responsive images.** The six theme photographs were 156 KB–882 KB each
  (2.6 MB total) at inconsistent aspect ratios. `tools/optimize-images.py`
  emits 480/720/1080 WebP plus a 720 JPEG fallback, uniformly cropped to 16:9
  so the card grid has no layout shift. Re-run it if the source photos change.
- **No layout shift.** Fixed `aspect-ratio` and explicit `width`/`height` on
  every image; two-line clamping on card titles; `tabular-nums` on every
  animated figure.
- **Compositor-only animation.** Only `opacity` and `transform` are animated.
  The hero parallax writes one CSS custom property per frame from a single
  rAF loop that is gated by an IntersectionObserver, and is skipped entirely
  on touch and narrow viewports.
- **Caching.** The previous build set `Cache-Control: no-store` via `<meta>`,
  disabling browser caching for every visitor on every visit. Removed — the
  `?v=` revision strings handle cache-busting instead.

### Smooth scrolling

Native CSS `scroll-behavior: smooth` with `scroll-padding-top` for the sticky
masthead, rather than an inertia library such as Lenis. On a statutory civic
portal, rewriting scroll position every frame breaks screen-reader virtual
cursors, browser find-in-page and keyboard paging, and adds main-thread work
that costs Lighthouse TBT — for no gain on anchor navigation, which is the
only scrolling this page actually drives.

---

## 9 · Image tooling

```bash
python tools/optimize-images.py   # theme card derivatives → assets/park-themes/opt/
python tools/build-hero.py        # hero backdrop → assets/hero/
```

Both need Pillow (`pip install Pillow`), are idempotent, and never modify the
source images.

`assets/themes/` holds an older, unreferenced 800px set of the same six
photographs. It is left in place rather than deleted, but nothing loads from
it — `assets/park-themes/` is the live source.
