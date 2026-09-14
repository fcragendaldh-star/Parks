/* ==========================================================================
   MCL PARK & GREEN BELT ADOPTION PORTAL — APPLICATION ENGINE
   Municipal Corporation Ludhiana

   CONTRACTS THAT MUST NOT CHANGE
   ------------------------------
   1. parks_data.json schema. Fields consumed here, unchanged:
        id, name, category, zone, ward, area_sqm, lat, lng,
        authority, status, footfall, contract_end, condition
   2. Form CSR-1 payload. Field names, option values, the Netlify
      `form-name`, the POST to "/" and the mailto fallback are all
      byte-for-byte as they were. Downstream systems (Netlify Forms
      dashboard, Horticulture Cell mailbox) depend on them.
   3. CSV export. Same column order, same header spellings, same
      filename pattern.

   Section map:
     01 State                     07 CSV export
     02 Element cache             08 Google Maps / GIS
     03 Boot                      09 Dossier modal (+ focus trap)
     04 Filtering & sorting       10 Form CSR-1 submission
     05 Rendering (cards/table)   11 Derived panels (impact, stewardship)
     06 Filter UI plumbing        12 Toast
   ========================================================================== */

(function () {
  "use strict";

  /* ======================================================================
     01 · STATE
     ====================================================================== */

  let ALL_SITES = [];
  let FILTERED_SITES = [];

  // Filter state — same semantics and same accepted values as before.
  let selectedStatus = "ALL";     // ALL | Available | RWA Managed | Adopted
  let selectedZone = "ALL";       // ALL | A | B | C | D
  let selectedCategory = "ALL";   // ALL | PARK | GREEN BELT
  let selectedWard = "ALL";       // ALL | <ward number as string>
  let currentView = "cards";      // cards | table
  let selectedId = null;

  /* Progressive rendering. Filtering, sorting and CSV export always run
     over the complete result set; only the number of DOM nodes is capped.
     Rendering all 918 records on every keystroke pushed the document past
     7,000 nodes and made re-filtering visibly janky. */
  const RENDER_CHUNK = 48;
  let renderLimit = RENDER_CHUNK;

  // GIS
  let map = null;
  let markerCluster = null;
  const markersById = Object.create(null);
  let mapsAvailable = false;      // true only once the Maps SDK really works

  const SQM_PER_ACRE = 4046.86;

  const els = {};

  /* ======================================================================
     02 · ELEMENT CACHE
     ====================================================================== */

  function cacheEls() {
    const byId = (id) => document.getElementById(id);

    // Registry views
    els.resultsCardsPane = byId("resultsCardsPane");
    els.siteList = byId("siteList");
    els.tableContainer = byId("tableContainer");
    els.tableBody = byId("tableBody");
    els.govTable = byId("govTable");
    els.viewCardsBtn = byId("viewCardsBtn");
    els.viewSplitBtn = byId("viewSplitBtn");
    els.viewMapBtn = byId("viewMapBtn");
    els.viewTableBtn = byId("viewTableBtn");
    els.gisArea = byId("gisArea");
    els.gisSplitLayout = byId("gisSplitLayout");
    els.gisSplitListPane = byId("gisSplitListPane");
    els.gisSplitList = byId("gisSplitList");
    els.gisSplitCount = byId("gisSplitCount");
    els.gisPanel = byId("gisPanel");
    els.loadMoreWrap = byId("loadMoreWrap");

    // Filters
    els.searchInput = byId("searchInput");
    els.searchClear = byId("searchClear");
    els.statusTabs = byId("statusTabs");
    els.zoneSelect = byId("zoneSelect");
    els.wardSelect = byId("wardSelect");
    els.categorySelect = byId("categorySelect");
    els.sortSelect = byId("sortSelect");
    els.resultCount = byId("resultCount");
    els.resetFilters = byId("resetFilters");
    els.activeFilters = byId("activeFilters");
    els.btnExportCsv = byId("btnExportCsv");
    els.exportFooterBtn = byId("exportFooterBtn");

    // Mobile filter sheet
    els.filtersPanel = byId("filtersPanel");
    els.filtersOpenBtn = byId("filtersOpenBtn");
    els.filtersCloseBtn = byId("filtersCloseBtn");
    els.filtersScrim = byId("filtersScrim");
    els.filtersApplyBtn = byId("filtersApplyBtn");
    els.filtersApplyCount = byId("filtersApplyCount");
    els.filterCountBadge = byId("filterCountBadge");

    // Statistics
    els.statTotal = byId("statTotal");
    els.statAvailable = byId("statAvailable");
    els.statRwa = byId("statRwa");
    els.statAdopted = byId("statAdopted");
    els.statArea = byId("statArea");

    // Derived panels
    els.meterZones = byId("meterZones");
    els.meterFootfall = byId("meterFootfall");
    els.figureStack = byId("figureStack");
    els.stewardshipList = byId("stewardshipList");
    els.adoptedCount = byId("adoptedCount");

    // GIS
    els.map = byId("map");
    els.mapPending = byId("mapPending");
    els.mapPendingTitle = byId("mapPendingTitle");
    els.mapPendingBody = byId("mapPendingBody");

    // Modal · dossier
    els.modalOverlay = byId("modalOverlay");
    els.modalContainer = byId("modalContainer");
    els.modalClose = byId("modalClose");
    els.modalSiteBlock = byId("modalSiteBlock");
    els.modalId = byId("modalId");
    els.modalStatusBadge = byId("modalStatusBadge");
    els.modalTitle = byId("modalTitle");
    els.modalCategory = byId("modalCategory");
    els.modalZone = byId("modalZone");
    els.modalWard = byId("modalWard");
    els.modalFootfall = byId("modalFootfall");
    els.modalArea = byId("modalArea");
    els.modalAuthority = byId("modalAuthority");
    els.modalContract = byId("modalContract");
    els.modalCondition = byId("modalCondition");
    els.modalCoords = byId("modalCoords");
    els.streetViewImg = byId("streetViewImg");
    els.imageryFallback = byId("imageryFallback");
    els.modalLocateGis = byId("modalLocateGis");
    els.modalMapsLink = byId("modalMapsLink");
    els.modalStreetViewLink = byId("modalStreetViewLink");

    // Modal · form
    els.interestForm = byId("interestForm");
    els.formHeading = byId("formHeading");
    els.formSubtext = byId("formSubtext");
    els.orgName = byId("orgName");
    els.orgType = byId("orgType");
    els.contactName = byId("contactPerson") || byId("contactName");
    els.contactRole = byId("contactRole");
    els.contactEmail = byId("contactEmail");
    els.contactPhone = byId("contactPhone");
    els.siteOfInterest = byId("siteOfInterest");
    els.themeSelect = byId("themeSelect");
    els.budgetRange = byId("budgetRange");
    els.proposedDuration = byId("proposedDuration");
    els.contactMessage = byId("contactMessage");
    els.submitBtn = byId("submitBtn");
    els.submitBtnLabel = byId("submitBtnLabel");

    // Modal · receipt
    els.modalSuccessCard = byId("modalSuccessCard");
    els.receiptRef = byId("receiptRef");
    els.receiptCopyBtn = byId("receiptCopyBtn");
    els.receiptTimestamp = byId("receiptTimestamp");
    els.receiptSite = byId("receiptSite");
    els.receiptOrg = byId("receiptOrg");
    els.receiptSignatory = byId("receiptSignatory");
    els.receiptContact = byId("receiptContact");
    els.receiptTheme = byId("receiptTheme");
    els.receiptPrintBtn = byId("receiptPrintBtn");
    els.receiptCloseBtn = byId("receiptCloseBtn");

    // Entry points & misc
    els.openInterestGlobal = byId("openInterestGlobal");
    els.openInterestFooter = byId("openInterestFooter");
    els.openInterestFooter2 = byId("openInterestFooter2");
    els.toast = byId("toast");
    els.siteYear = byId("siteYear");
  }

  /* ======================================================================
     03 · BOOT
     ====================================================================== */

  async function init() {
    cacheEls();
    bindEvents();

    if (els.siteYear) els.siteYear.textContent = String(new Date().getFullYear());

    try {
      const res = await fetch("parks_data.json");
      if (!res.ok) throw new Error("HTTP " + res.status);
      ALL_SITES = await res.json();
      if (!Array.isArray(ALL_SITES)) throw new Error("Unexpected dataset shape");
    } catch (err) {
      console.error("Could not load parks_data.json", err);
      renderRegistryError();
      return;
    }

    populateWardDropdown();
    updateStatistics();
    updateStatusCounts();
    buildImpactPanels();
    buildStewardshipList();
    applyFilters();
    initGis();
  }

  function renderRegistryError() {
    if (!els.siteList) return;
    els.siteList.innerHTML =
      '<div class="empty-state">' +
      "<h3>The municipal register could not be loaded</h3>" +
      "<p>The dataset <code>parks_data.json</code> did not load. Please reload the " +
      "page. If the problem persists, contact the Municipal Corporation on " +
      '<a href="tel:+919086791867">90867-91867</a>.</p>' +
      "</div>";
  }

  /* ======================================================================
     04 · FILTERING & SORTING
     Logic is preserved exactly, including the "ward 12" / "w12" keyword
     shortcut and its short-circuit behaviour.
     ====================================================================== */

  function applyFilters(options) {
    const resetPaging = !options || options.resetPaging !== false;

    const q = els.searchInput.value.trim().toLowerCase();

    // "ward 12", "w12", "Ward12" → match ward 12 directly.
    const wardSearchMatch = q.match(/(?:ward|w)\s*([0-9]{1,2})/);
    const targetWardFromQuery = wardSearchMatch ? parseInt(wardSearchMatch[1], 10) : null;

    FILTERED_SITES = ALL_SITES.filter((s) => {
      if (selectedStatus !== "ALL" && s.status !== selectedStatus) return false;
      if (selectedZone !== "ALL" && s.zone !== selectedZone) return false;
      if (selectedWard !== "ALL" && String(s.ward) !== String(selectedWard)) return false;
      if (selectedCategory !== "ALL" && s.category !== selectedCategory) return false;

      if (q) {
        if (targetWardFromQuery && s.ward === targetWardFromQuery) return true;
        const haystack = (
          s.name + " " + s.id + " zone " + s.zone + " ward " + s.ward +
          " " + s.authority + " " + s.category
        ).toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    sortFiltered(els.sortSelect.value);

    const isFiltered =
      q !== "" ||
      selectedStatus !== "ALL" ||
      selectedZone !== "ALL" ||
      selectedWard !== "ALL" ||
      selectedCategory !== "ALL";

    els.resetFilters.hidden = !isFiltered;

    if (resetPaging) {
      renderLimit = RENDER_CHUNK;
      if (els.resultsCardsPane) els.resultsCardsPane.scrollTop = 0;
      if (els.tableContainer) els.tableContainer.scrollTop = 0;
      if (els.gisSplitList) els.gisSplitList.scrollTop = 0;
    }

    renderActiveFilters(isFiltered);
    updateFilterCountBadge();
    renderViews();
    renderMapMarkers();
  }

  function sortFiltered(sort) {
    if (sort === "name") {
      FILTERED_SITES.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sort === "area-desc") {
      FILTERED_SITES.sort((a, b) => (b.area_sqm || 0) - (a.area_sqm || 0));
    } else if (sort === "area-asc") {
      FILTERED_SITES.sort((a, b) => (a.area_sqm || 0) - (b.area_sqm || 0));
    } else if (sort === "ward") {
      FILTERED_SITES.sort(
        (a, b) => (a.ward || 999) - (b.ward || 999) || a.name.localeCompare(b.name)
      );
    } else if (sort === "zone") {
      FILTERED_SITES.sort(
        (a, b) => a.zone.localeCompare(b.zone) || a.name.localeCompare(b.name)
      );
    }
  }

  function resetAllFilters() {
    els.searchInput.value = "";
    els.searchClear.hidden = true;

    selectedStatus = "ALL";
    setStatusChecked("ALL");

    selectedZone = "ALL";
    els.zoneSelect.value = "ALL";
    selectedWard = "ALL";
    els.wardSelect.value = "ALL";
    selectedCategory = "ALL";
    els.categorySelect.value = "ALL";
    els.sortSelect.value = "name";

    applyFilters();
  }

  /* ======================================================================
     05 · RENDERING
     ====================================================================== */

  function renderViews() {
    const total = ALL_SITES.length;
    const n = FILTERED_SITES.length;

    // Announced politely via role="status" on the container.
    els.resultCount.innerHTML =
      "Showing <strong>" + n.toLocaleString("en-IN") + "</strong> of " +
      total.toLocaleString("en-IN") + " site" + (total === 1 ? "" : "s");

    if (els.filtersApplyCount) els.filtersApplyCount.textContent = n.toLocaleString("en-IN");

    if (currentView === "cards") {
      renderCardList();
    } else if (currentView === "split") {
      renderSplitList();
    } else if (currentView === "table") {
      renderTableList();
    }

    renderLoadMore();
    renderMapMarkers();
  }

  function visibleSlice() {
    return FILTERED_SITES.slice(0, renderLimit);
  }

  function statusTagClass(status) {
    if (status === "Available") return "tag--status-available";
    if (status === "RWA Managed") return "tag--status-rwa";
    return "tag--status-adopted";
  }

  /* ---- Cards ---------------------------------------------------------- */

  function renderCardList() {
    if (!FILTERED_SITES.length) {
      renderEmptyState();
      return;
    }

    const frag = document.createDocumentFragment();

    for (const s of visibleSlice()) {
      const card = document.createElement("button");
      card.type = "button";
      card.className =
        "site-card site-card--zone-" + s.zone + (s.id === selectedId ? " is-selected" : "");
      card.dataset.id = s.id;
      card.setAttribute(
        "aria-label",
        s.name + ", " + s.id + ", " + s.status + ", Zone " + s.zone +
          (s.ward ? ", Ward " + s.ward : "") + ". Open asset dossier and Expression of Interest."
      );

      const top = document.createElement("div");
      top.className = "site-card__top";

      const id = document.createElement("span");
      id.className = "site-card__id";
      id.textContent = s.id;

      const status = document.createElement("span");
      status.className = "tag tag--status " + statusTagClass(s.status);
      status.textContent = s.status;

      top.append(id, status);

      const name = document.createElement("span");
      name.className = "site-card__name";
      name.textContent = s.name;

      const meta = document.createElement("div");
      meta.className = "site-card__meta";
      meta.append(
        tag("tag tag--zone", "Zone " + s.zone),
        ...(s.ward ? [tag("tag tag--ward", "Ward " + s.ward)] : []),
        tag("tag", s.category === "GREEN BELT" ? "Green belt" : "Park"),
        tag("tag", s.footfall + "/day"),
        tag("site-card__area", formatArea(s.area_sqm))
      );

      // Card action footer: quick locate on map + view dossier
      const actions = document.createElement("div");
      actions.className = "site-card__actions";

      const btnLocate = document.createElement("span");
      btnLocate.className = "btn-locate-action";
      btnLocate.innerHTML = '<svg aria-hidden="true" focusable="false"><use href="#i-map"></use></svg><span>Locate on Map</span>';
      btnLocate.addEventListener("click", (e) => {
        e.stopPropagation();
        focusSiteOnMap(s);
      });

      const btnDossier = document.createElement("span");
      btnDossier.className = "btn-card-dossier";
      btnDossier.textContent = "View dossier →";

      actions.append(btnLocate, btnDossier);
      card.append(top, name, meta, actions);
      frag.appendChild(card);
    }

    els.siteList.replaceChildren(frag);
  }

  function tag(className, text) {
    const el = document.createElement("span");
    el.className = className;
    el.textContent = text;
    return el;
  }

  function renderEmptyState() {
    const wrap = document.createElement("div");
    wrap.className = "empty-state";
    wrap.innerHTML =
      '<svg aria-hidden="true" focusable="false"><use href="#i-search"></use></svg>' +
      "<h3>No municipal sites match these criteria</h3>" +
      "<p>Try clearing a filter, or search for a different ward number or locality.</p>";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn--primary";
    btn.textContent = "Reset all filters";
    btn.addEventListener("click", resetAllFilters);
    wrap.appendChild(btn);

    els.siteList.replaceChildren(wrap);
    if (els.tableBody) els.tableBody.replaceChildren();
    if (els.gisSplitList) els.gisSplitList.replaceChildren(wrap.cloneNode(true));
  }

  /* ---- Split List ----------------------------------------------------- */

  function renderSplitList() {
    if (!els.gisSplitList) return;

    if (els.gisSplitCount) {
      els.gisSplitCount.textContent =
        FILTERED_SITES.length.toLocaleString("en-IN") + " site" + (FILTERED_SITES.length === 1 ? "" : "s") + " in view";
    }

    if (!FILTERED_SITES.length) {
      els.gisSplitList.innerHTML =
        '<div style="text-align:center;padding:2rem 1rem;color:var(--ink-2);">' +
        '<p>No parks match current filters.</p>' +
        '</div>';
      return;
    }

    const frag = document.createDocumentFragment();

    for (const s of visibleSlice()) {
      const card = document.createElement("div");
      card.className =
        "gis-split-card gis-split-card--zone-" + s.zone + (s.id === selectedId ? " is-active-site" : "");
      card.dataset.id = s.id;
      card.id = "split-card-" + s.id;

      const top = document.createElement("div");
      top.className = "gis-split-card__top";
      top.innerHTML =
        '<span class="tag tag--status ' + statusTagClass(s.status) + '">' + s.status + '</span>' +
        '<span class="tag tag--zone">Zone ' + s.zone + (s.ward ? ' · W' + s.ward : '') + '</span>';

      const name = document.createElement("span");
      name.className = "gis-split-card__name";
      name.textContent = s.name;

      const meta = document.createElement("div");
      meta.className = "gis-split-card__meta";
      meta.innerHTML =
        '<span>' + formatArea(s.area_sqm) + '</span> · ' +
        '<span>' + (s.category === "GREEN BELT" ? "Green belt" : "Park") + '</span> · ' +
        '<span>' + s.footfall + '/day</span>';

      const actions = document.createElement("div");
      actions.className = "gis-split-card__actions";

      const btnLocate = document.createElement("button");
      btnLocate.type = "button";
      btnLocate.className = "btn-locate-action";
      btnLocate.innerHTML = '<svg aria-hidden="true" focusable="false"><use href="#i-pin"></use></svg><span>Focus Map</span>';
      btnLocate.addEventListener("click", (e) => {
        e.stopPropagation();
        focusSiteOnMap(s);
      });

      const btnDossier = document.createElement("button");
      btnDossier.type = "button";
      btnDossier.className = "btn-card-dossier";
      btnDossier.textContent = "View dossier →";
      btnDossier.addEventListener("click", (e) => {
        e.stopPropagation();
        openModal(s.id);
      });

      actions.append(btnLocate, btnDossier);
      card.append(top, name, meta, actions);

      card.addEventListener("click", () => {
        focusSiteOnMap(s);
      });

      frag.appendChild(card);
    }

    els.gisSplitList.replaceChildren(frag);
  }

  /* ---- Table ---------------------------------------------------------- */

  const TABLE_COLUMNS = [
    "MCL ID", "Site name", "Type", "Zone", "Ward",
    "Area", "Authority", "Status", "Action",
  ];

  function renderTableList() {
    if (!els.tableBody) return;

    if (!FILTERED_SITES.length) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = TABLE_COLUMNS.length;
      td.style.textAlign = "center";
      td.style.padding = "2rem 1rem";
      td.textContent = "No records match the current filter selection.";
      tr.appendChild(td);
      els.tableBody.replaceChildren(tr);
      return;
    }

    const frag = document.createDocumentFragment();

    for (const s of visibleSlice()) {
      const tr = document.createElement("tr");
      if (s.id === selectedId) tr.classList.add("is-selected");

      const cells = [
        { cls: "cell-id", text: s.id },
        { cls: "cell-name", text: s.name },
        { cls: "", text: s.category === "GREEN BELT" ? "Green belt" : "Park" },
        { cls: "", text: "Zone " + s.zone },
        { cls: "", text: s.ward ? "Ward " + s.ward : "—" },
        {
          cls: "cell-area",
          text: s.area_sqm ? (s.area_sqm / SQM_PER_ACRE).toFixed(2) + " ac" : "—",
        },
        { cls: "", text: s.authority },
      ];

      cells.forEach((c, i) => {
        const td = document.createElement("td");
        if (c.cls) td.className = c.cls;
        td.dataset.label = TABLE_COLUMNS[i];
        td.textContent = c.text;
        tr.appendChild(td);
      });

      const tdStatus = document.createElement("td");
      tdStatus.dataset.label = TABLE_COLUMNS[7];
      tdStatus.appendChild(tag("tag tag--status " + statusTagClass(s.status), s.status));
      tr.appendChild(tdStatus);

      const tdAction = document.createElement("td");
      tdAction.className = "cell-action";
      tdAction.dataset.label = TABLE_COLUMNS[8];

      const btnLocate = document.createElement("button");
      btnLocate.type = "button";
      btnLocate.className = "btn-locate-action";
      btnLocate.style.marginRight = "0.375rem";
      btnLocate.dataset.id = s.id;
      btnLocate.innerHTML = '<svg aria-hidden="true" focusable="false"><use href="#i-pin"></use></svg> <span>Locate</span>';
      btnLocate.addEventListener("click", (e) => {
        e.stopPropagation();
        focusSiteOnMap(s);
      });

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn-table-action";
      btn.dataset.id = s.id;
      btn.textContent = "Dossier";
      btn.setAttribute("aria-label", "View dossier and apply for " + s.name);

      tdAction.append(btnLocate, btn);
      tr.appendChild(tdAction);

      frag.appendChild(tr);
    }

    els.tableBody.replaceChildren(frag);
  }

  /* ---- Load more ------------------------------------------------------ */

  function renderLoadMore() {
    if (!els.loadMoreWrap) return;

    const remaining = FILTERED_SITES.length - renderLimit;
    if (remaining <= 0) {
      if (FILTERED_SITES.length > RENDER_CHUNK) {
        els.loadMoreWrap.innerHTML =
          '<p class="load-more-done">Showing all ' +
          FILTERED_SITES.length.toLocaleString("en-IN") + " municipal sites</p>";
      } else {
        els.loadMoreWrap.replaceChildren();
      }
      return;
    }

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn--ghost btn--sm";
    btn.id = "loadMoreBtn";
    btn.textContent =
      "Show " + Math.min(RENDER_CHUNK, remaining) + " more · " +
      remaining.toLocaleString("en-IN") + " remaining";
    btn.addEventListener("click", () => {
      /* Note where the new content starts so keyboard users are not
         dumped back at the top of the list. */
      const firstNewIndex = renderLimit;
      renderLimit += RENDER_CHUNK;
      renderViews();
      focusResultAt(firstNewIndex);
    });

    els.loadMoreWrap.replaceChildren(btn);
  }

  function focusResultAt(index) {
    const selector = currentView === "cards"
      ? ".site-card"
      : ".btn-table-action";
    const nodes = (currentView === "cards" ? els.siteList : els.tableBody)
      .querySelectorAll(selector);
    const target = nodes[index];
    if (target) target.focus({ preventScroll: false });
  }

  /* ---- Formatting ----------------------------------------------------- */

  function formatArea(sqm) {
    if (!sqm) return "—";
    const acres = sqm / SQM_PER_ACRE;
    return acres >= 0.1 ? acres.toFixed(2) + " ac" : Math.round(sqm) + " m²";
  }

  function debounce(fn, ms) {
    let t;
    return function () {
      const args = arguments;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(null, args), ms);
    };
  }

  /* ======================================================================
     06 · FILTER UI PLUMBING
     ====================================================================== */

  function populateWardDropdown() {
    const wardCounts = Object.create(null);
    for (const s of ALL_SITES) {
      if (s.ward) wardCounts[s.ward] = (wardCounts[s.ward] || 0) + 1;
    }

    const sortedWards = Object.keys(wardCounts).map(Number).sort((a, b) => a - b);

    const frag = document.createDocumentFragment();
    const all = document.createElement("option");
    all.value = "ALL";
    all.textContent = "All wards";
    frag.appendChild(all);

    for (const w of sortedWards) {
      const opt = document.createElement("option");
      opt.value = String(w);
      opt.textContent =
        "Ward " + w + " — " + wardCounts[w] + " site" + (wardCounts[w] === 1 ? "" : "s");
      frag.appendChild(opt);
    }
    els.wardSelect.replaceChildren(frag);
  }

  /** Recomputes the headline figures from the dataset and hands the real
      values to the count-up animation via data-count-to. */
  function updateStatistics() {
    let available = 0, rwa = 0, adopted = 0, totalSqm = 0;

    for (const s of ALL_SITES) {
      if (s.status === "Available") available++;
      else if (s.status === "RWA Managed") rwa++;
      else if (s.status === "Adopted") adopted++;
      totalSqm += s.area_sqm || 0;
    }

    setStat(els.statTotal, ALL_SITES.length, 0);
    setStat(els.statAvailable, available, 0);
    setStat(els.statRwa, rwa, 0);
    setStat(els.statAdopted, adopted, 0);
    setStat(els.statArea, totalSqm / SQM_PER_ACRE, 1);

    if (els.adoptedCount) els.adoptedCount.textContent = String(adopted);
  }

  function setStat(el, value, decimals) {
    if (!el) return;
    el.dataset.countTo = String(value);
    if (decimals > 0) el.dataset.countDecimals = String(decimals);
    el.textContent = decimals > 0 ? value.toFixed(decimals) : value.toLocaleString("en-IN");
  }

  function updateStatusCounts() {
    const counts = { ALL: ALL_SITES.length, Available: 0, "RWA Managed": 0, Adopted: 0 };
    for (const s of ALL_SITES) {
      if (counts[s.status] !== undefined) counts[s.status]++;
    }
    document.querySelectorAll("[data-count-for]").forEach((el) => {
      const key = el.dataset.countFor;
      if (counts[key] !== undefined) el.textContent = counts[key].toLocaleString("en-IN");
    });
  }

  /** Dismissible summary of the active filters. */
  function renderActiveFilters(isFiltered) {
    if (!els.activeFilters) return;
    if (!isFiltered) {
      els.activeFilters.replaceChildren();
      return;
    }

    const chips = [];
    const q = els.searchInput.value.trim();
    if (q) chips.push({ label: '“' + q + '”', clear: () => { els.searchInput.value = ""; els.searchClear.hidden = true; } });
    if (selectedStatus !== "ALL") chips.push({ label: selectedStatus, clear: () => { selectedStatus = "ALL"; setStatusChecked("ALL"); } });
    if (selectedZone !== "ALL") chips.push({ label: "Zone " + selectedZone, clear: () => { selectedZone = "ALL"; els.zoneSelect.value = "ALL"; } });
    if (selectedWard !== "ALL") chips.push({ label: "Ward " + selectedWard, clear: () => { selectedWard = "ALL"; els.wardSelect.value = "ALL"; } });
    if (selectedCategory !== "ALL") {
      chips.push({
        label: selectedCategory === "GREEN BELT" ? "Green belts" : "Parks",
        clear: () => { selectedCategory = "ALL"; els.categorySelect.value = "ALL"; },
      });
    }

    const frag = document.createDocumentFragment();
    for (const c of chips) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip-dismiss";
      btn.innerHTML = '<span class="x" aria-hidden="true">✕</span>';
      btn.prepend(document.createTextNode(c.label));
      btn.setAttribute("aria-label", "Remove filter: " + c.label);
      btn.addEventListener("click", () => { c.clear(); applyFilters(); });
      frag.appendChild(btn);
    }
    els.activeFilters.replaceChildren(frag);
  }

  function activeFilterCount() {
    let n = 0;
    if (els.searchInput.value.trim()) n++;
    if (selectedStatus !== "ALL") n++;
    if (selectedZone !== "ALL") n++;
    if (selectedWard !== "ALL") n++;
    if (selectedCategory !== "ALL") n++;
    return n;
  }

  function updateFilterCountBadge() {
    if (!els.filterCountBadge) return;
    const n = activeFilterCount();
    els.filterCountBadge.textContent = n ? String(n) : "";
  }

  /* ---- Status radiogroup ---------------------------------------------- */

  function setStatusChecked(status) {
    const tabs = els.statusTabs.querySelectorAll(".status-tab");
    tabs.forEach((t) => {
      const on = t.dataset.status === status;
      t.setAttribute("aria-checked", on ? "true" : "false");
      // Roving tabindex: only the checked radio is in the tab order.
      t.tabIndex = on ? 0 : -1;
    });
  }

  /** Arrow-key navigation, as required for role="radiogroup". */
  function onStatusKeydown(e) {
    const keys = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"];
    if (!keys.includes(e.key)) return;
    e.preventDefault();

    const tabs = Array.from(els.statusTabs.querySelectorAll(".status-tab"));
    const current = tabs.findIndex((t) => t.getAttribute("aria-checked") === "true");
    const forward = e.key === "ArrowRight" || e.key === "ArrowDown";
    const next = (current + (forward ? 1 : -1) + tabs.length) % tabs.length;

    selectedStatus = tabs[next].dataset.status;
    setStatusChecked(selectedStatus);
    tabs[next].focus();
    applyFilters();
  }

  /* ---- View switch ---------------------------------------------------- */

  function switchView(viewName) {
    currentView = viewName;

    if (els.viewCardsBtn) els.viewCardsBtn.setAttribute("aria-pressed", viewName === "cards" ? "true" : "false");
    if (els.viewSplitBtn) els.viewSplitBtn.setAttribute("aria-pressed", viewName === "split" ? "true" : "false");
    if (els.viewMapBtn) els.viewMapBtn.setAttribute("aria-pressed", viewName === "map" ? "true" : "false");
    if (els.viewTableBtn) els.viewTableBtn.setAttribute("aria-pressed", viewName === "table" ? "true" : "false");

    if (els.resultsCardsPane) els.resultsCardsPane.hidden = viewName !== "cards";
    if (els.siteList) els.siteList.hidden = viewName !== "cards";
    if (els.tableContainer) els.tableContainer.hidden = viewName !== "table";
    if (els.gisArea) els.gisArea.hidden = viewName !== "split" && viewName !== "map";

    if (els.gisSplitLayout && els.gisSplitListPane) {
      if (viewName === "split") {
        els.gisSplitLayout.classList.remove("is-full-map");
        els.gisSplitListPane.hidden = false;
      } else if (viewName === "map") {
        els.gisSplitLayout.classList.add("is-full-map");
        els.gisSplitListPane.hidden = true;
      }
    }

    renderViews();

    if (viewName === "split" || viewName === "map") {
      setTimeout(() => {
        if (!map) initGis();
        else if (map.invalidateSize) map.invalidateSize();
      }, 60);
    }
  }

  function focusSiteOnMap(site) {
    if (!site) return;
    selectedId = site.id;

    if (currentView !== "split" && currentView !== "map") {
      switchView("split");
    }

    const reg = document.getElementById("registry");
    if (reg) {
      reg.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    setTimeout(() => {
      if (map) {
        if (map.setView) {
          map.setView([site.lat, site.lng], 16, { animate: true });
        }
        if (markersById[site.id] && markersById[site.id].openPopup) {
          markersById[site.id].openPopup();
        }
      }

      // Highlight split card if split list is present
      const cardEl = document.getElementById("split-card-" + site.id);
      if (cardEl) {
        cardEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
        document.querySelectorAll(".gis-split-card").forEach((c) => c.classList.remove("is-active-site"));
        cardEl.classList.add("is-active-site");
      }
    }, 150);
  }

  /* ---- Mobile filter bottom sheet ------------------------------------- */

  let lastFilterTrigger = null;

  function openFilterSheet() {
    if (!els.filtersPanel) return;
    lastFilterTrigger = document.activeElement;

    els.filtersScrim.hidden = false;
    // Next frame, so the transition has a start state to animate from.
    requestAnimationFrame(() => els.filtersScrim.classList.add("is-open"));
    els.filtersPanel.classList.add("is-open");
    els.filtersOpenBtn.setAttribute("aria-expanded", "true");
    els.filtersApplyBtn.hidden = false;
    document.body.classList.add("is-locked");

    els.searchInput.focus({ preventScroll: true });
  }

  function closeFilterSheet() {
    if (!els.filtersPanel) return;

    els.filtersScrim.classList.remove("is-open");
    els.filtersPanel.classList.remove("is-open");
    els.filtersOpenBtn.setAttribute("aria-expanded", "false");
    els.filtersApplyBtn.hidden = true;
    document.body.classList.remove("is-locked");

    // Keep the scrim in the DOM until it has faded out.
    const hideScrim = () => { els.filtersScrim.hidden = true; };
    if (window.Motion && window.Motion.prefersReducedMotion) hideScrim();
    else setTimeout(hideScrim, 260);

    if (lastFilterTrigger && document.contains(lastFilterTrigger)) {
      lastFilterTrigger.focus({ preventScroll: true });
    }
    lastFilterTrigger = null;
  }

  function isFilterSheetOpen() {
    return !!els.filtersPanel && els.filtersPanel.classList.contains("is-open");
  }

  /* ======================================================================
     07 · CSV EXPORT
     Column order, header spellings, quoting and filename pattern are
     unchanged — downstream spreadsheets and any import tooling depend
     on them.
     ====================================================================== */

  function exportFilteredToCSV() {
    if (!FILTERED_SITES.length) {
      showToast("No records to export.", "warn");
      return;
    }

    const headers = [
      "ID", "Name", "Category", "Zone", "Ward", "Area_Sqm", "Area_Acres",
      "Authority", "Status", "Daily_Footfall", "Contract_End", "Latitude", "Longitude",
    ];

    const csvRows = [headers.join(",")];

    for (const s of FILTERED_SITES) {
      csvRows.push([
        s.id,
        quote(s.name),
        s.category,
        s.zone,
        s.ward || "",
        s.area_sqm || "",
        s.area_sqm ? (s.area_sqm / SQM_PER_ACRE).toFixed(2) : "",
        quote(s.authority),
        s.status,
        s.footfall,
        s.contract_end || "",
        s.lat,
        s.lng,
      ].join(","));
    }

    const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download =
      "MCL_Parks_Register_Export_" + new Date().toISOString().split("T")[0] + ".csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);   // release the blob (the old build leaked it)

    showToast(
      "Exported " + FILTERED_SITES.length.toLocaleString("en-IN") +
      " municipal records to CSV."
    );
  }

  function quote(value) {
    return '"' + String(value == null ? "" : value).replace(/"/g, '""') + '"';
  }

  /* ======================================================================
     08 · LEAFLET & GIS GEOSPATIAL MAP
     ====================================================================== */

  const ZONE_COLORS = { A: "#1B5A39", B: "#A94E28", C: "#1E5E7E", D: "#6B4E8F" };

  function initGis() {
    if (map) return;
    if (typeof L === "undefined" || !els.map) return;

    try {
      map = L.map(els.map, {
        center: [30.9010, 75.8573],
        zoom: 12,
        zoomControl: true,
        scrollWheelZoom: true,
      });

      // CartoDB Voyager raster tiles (fast, crisp, high-contrast)
      L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: "abcd",
        maxZoom: 19,
      }).addTo(map);

      buildAllMarkers();
      renderMapMarkers();
    } catch (err) {
      console.error("GIS map failed to initialise", err);
    }
  }

  function buildAllMarkers() {
    if (!map || typeof L === "undefined") return;

    if (typeof L.markerClusterGroup === "function") {
      markerCluster = L.markerClusterGroup({
        maxClusterRadius: 36,
        showCoverageOnHover: false,
        disableClusteringAtZoom: 16,
        spiderfyOnMaxZoom: true,
      });
      map.addLayer(markerCluster);
    }

    for (const s of ALL_SITES) {
      const isAvail = s.status === "Available";
      const pinHtml =
        `<div class="mcl-map-pin mcl-map-pin--zone-${s.zone} ${isAvail ? 'is-available' : ''}" title="${s.name} (${s.id})">` +
        `<span>${s.zone}</span>` +
        `</div>`;

      const icon = L.divIcon({
        className: "leaflet-custom-marker",
        html: pinHtml,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
        popupAnchor: [0, -12],
      });

      const marker = L.marker([s.lat, s.lng], { icon: icon });

      const popupContent =
        `<div class="gis-popup">` +
        `  <div class="gis-popup__head">` +
        `    <span class="tag tag--status ${statusTagClass(s.status)}">${s.status}</span>` +
        `    <span class="gis-popup__id">${s.id}</span>` +
        `  </div>` +
        `  <h4 class="gis-popup__name">${s.name}</h4>` +
        `  <div class="gis-popup__meta">` +
        `    <span><strong>Zone:</strong> ${s.zone}</span>` +
        `    <span><strong>Ward:</strong> ${s.ward || '—'}</span>` +
        `    <span><strong>Area:</strong> ${formatArea(s.area_sqm)}</span>` +
        `    <span><strong>Footfall:</strong> ${s.footfall}/day</span>` +
        `  </div>` +
        `  <div class="gis-popup__actions">` +
        `    <button type="button" class="btn btn--secondary btn--sm" onclick="window.__portalOpenModal('${s.id}')">` +
        `      Dossier` +
        `    </button>` +
        `    <button type="button" class="btn btn--primary btn--sm" onclick="window.__portalOpenEoi('${s.id}')">` +
        `      Adopt Park (EOI)` +
        `    </button>` +
        `  </div>` +
        `</div>`;

      marker.bindPopup(popupContent, { maxWidth: 290 });

      marker.on("click", () => {
        selectedId = s.id;
        const cardEl = document.getElementById("split-card-" + s.id);
        if (cardEl) {
          cardEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
          document.querySelectorAll(".gis-split-card").forEach((c) => c.classList.remove("is-active-site"));
          cardEl.classList.add("is-active-site");
        }
      });

      markersById[s.id] = marker;
    }
  }

  function renderMapMarkers() {
    if (!map) return;

    if (markerCluster) {
      markerCluster.clearLayers();
      const visible = FILTERED_SITES.map((s) => markersById[s.id]).filter(Boolean);
      markerCluster.addLayers(visible);
    } else {
      for (const id in markersById) {
        map.removeLayer(markersById[id]);
      }
      FILTERED_SITES.forEach((s) => {
        if (markersById[s.id]) map.addLayer(markersById[s.id]);
      });
    }

    if (FILTERED_SITES.length > 0 && FILTERED_SITES.length < ALL_SITES.length) {
      const latlngs = FILTERED_SITES.map((s) => [s.lat, s.lng]);
      if (latlngs.length > 0) {
        map.fitBounds(latlngs, { padding: [30, 30], maxZoom: 15 });
      }
    }
  }

  /* ======================================================================
     09 · DOSSIER MODAL
     ====================================================================== */

  const FOCUSABLE_SELECTOR = [
    "a[href]", "button:not([disabled])", "input:not([disabled])",
    "select:not([disabled])", "textarea:not([disabled])", "summary",
    '[tabindex]:not([tabindex="-1"])',
  ].join(",");

  let lastModalTrigger = null;

  function openModal(id) {
    selectedId = id;
    lastModalTrigger = document.activeElement;

    const site = id ? ALL_SITES.find((s) => s.id === id) : null;

    if (site) {
      renderDossier(site);
      setTimeout(() => {
        if (miniMap) miniMap.invalidateSize();
      }, 60);
    } else {
      renderGeneralEoi();
    }

    if (els.interestForm) els.interestForm.hidden = false;
    if (els.modalSuccessCard) els.modalSuccessCard.hidden = true;

    els.modalOverlay.hidden = false;
    document.body.classList.add("is-locked");

    // Reflect selection in whichever view is showing.
    renderViews();

    // Focus the dialog itself, not the first field: announcing the form's
    // title before its inputs gives context.
    els.modalContainer.setAttribute("tabindex", "-1");
    els.modalContainer.focus({ preventScroll: true });

    document.addEventListener("keydown", onModalKeydown, true);
  }

  function renderDossier(site) {
    els.modalContainer.classList.remove("is-single-col");
    els.modalSiteBlock.hidden = false;

    els.modalId.textContent = "Municipal asset ID: " + site.id;
    els.modalTitle.textContent = site.name;

    els.modalStatusBadge.textContent = site.status;
    els.modalStatusBadge.className = "tag tag--status " + statusTagClass(site.status);

    els.modalCategory.textContent = site.category === "GREEN BELT" ? "Green belt" : "Park";
    els.modalZone.textContent = "Zone " + site.zone;
    els.modalWard.textContent = site.ward ? "Ward " + site.ward : "Ward unspecified";
    els.modalFootfall.textContent = site.footfall + " visitors/day";

    els.modalArea.textContent = site.area_sqm
      ? Math.round(site.area_sqm).toLocaleString("en-IN") + " m² · " +
        (site.area_sqm / SQM_PER_ACRE).toFixed(2) + " acres"
      : "Area not recorded";

    els.modalAuthority.textContent = site.authority;
    els.modalContract.textContent = site.contract_end
      ? "Under agreement until " + site.contract_end
      : "Open for immediate adoption (CSR & Business)";
    els.modalCondition.textContent = site.condition || "Average";
    els.modalCoords.textContent =
      site.lat.toFixed(6) + "° N, " + site.lng.toFixed(6) + "° E";

    els.modalMapsLink.href =
      "https://www.google.com/maps/search/?api=1&query=" + site.lat + "," + site.lng;
    els.modalStreetViewLink.href =
      "https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=" + site.lat + "," + site.lng;

    renderStreetView(site);

    els.siteOfInterest.value =
      site.name + " (" + site.id + " · Ward " + (site.ward || "—") + " · Zone " + site.zone + ")";

    els.formHeading.textContent = "Applicant & park adoption details";
    els.formSubtext.textContent =
      site.status === "Available"
        ? "This municipal asset is managed directly by MCL and is open for immediate CSR & business entity adoption."
        : "This asset is currently under " + site.authority + " agreement (" +
          (site.contract_end || "active") +
          "). Expressions for co-development or renewal are accepted.";

    focusMapOn(site);
  }

  function getMapsApiKey() {
    return (typeof GOOGLE_MAPS_API_KEY === "string" && GOOGLE_MAPS_API_KEY !== "your-restricted-key-here")
      ? GOOGLE_MAPS_API_KEY.trim()
      : "";
  }

  function focusMapOn(site) {
    if (!map || !site || typeof site.lat !== "number") return;
    if (typeof map.panTo === "function") {
      map.panTo([site.lat, site.lng]);
    }
  }

  let miniMap = null;
  let miniMapMarker = null;

  function updateModalMiniMap(site) {
    if (typeof L === "undefined") return;
    const container = document.getElementById("modalMiniMap");
    if (!container) return;

    if (!miniMap) {
      miniMap = L.map(container, {
        center: [site.lat, site.lng],
        zoom: 17,
        zoomControl: false,
        attributionControl: false,
        scrollWheelZoom: false,
        dragging: true,
      });

      // High-resolution Esri World Imagery (Satellite photography)
      L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        { maxZoom: 19, attribution: "Esri" }
      ).addTo(miniMap);

      miniMapMarker = L.circleMarker([site.lat, site.lng], {
        radius: 8,
        fillColor: "#10B981",
        color: "#ffffff",
        weight: 2,
        fillOpacity: 0.95,
      }).addTo(miniMap);
    } else {
      miniMap.setView([site.lat, site.lng], 17);
      if (miniMapMarker) miniMapMarker.setLatLng([site.lat, site.lng]);
    }

    setTimeout(() => {
      if (miniMap) miniMap.invalidateSize();
    }, 100);
  }

  function renderStreetView(site) {
    const badge = document.getElementById("modalImageryBadge");
    updateModalMiniMap(site);

    const key = getMapsApiKey();
    if (!key) {
      els.streetViewImg.hidden = true;
      els.streetViewImg.removeAttribute("src");
      if (badge) badge.textContent = "Satellite Imagery";
      return;
    }

    els.streetViewImg.alt = "Street View photograph looking towards " + site.name;
    els.streetViewImg.onerror = function () {
      els.streetViewImg.hidden = true;
      if (badge) badge.textContent = "Satellite Imagery (No Street View coverage)";
    };
    els.streetViewImg.onload = function () {
      els.streetViewImg.hidden = false;
      if (badge) badge.textContent = "Google Street View";
    };
    els.streetViewImg.src =
      "https://maps.googleapis.com/maps/api/streetview?size=640x480&location=" +
      site.lat + "," + site.lng + "&fov=90&return_error_code=true&key=" + encodeURIComponent(key);
  }

  function renderGeneralEoi() {
    els.modalContainer.classList.add("is-single-col");
    els.modalSiteBlock.hidden = true;
    els.formHeading.textContent = "General expression of interest (city-wide)";
    els.formSubtext.textContent =
      "Submit a city-wide greening proposal covering multiple wards or green corridors across Ludhiana — open to corporates, MSMEs, traders, and organizations.";
    els.siteOfInterest.value =
      "General Expression of Interest (City-Wide / Multi-Site Green Initiative)";
  }

  function closeModal() {
    if (els.modalOverlay.hidden) return;

    els.modalOverlay.hidden = true;
    document.body.classList.remove("is-locked");
    document.removeEventListener("keydown", onModalKeydown, true);

    if (lastModalTrigger && document.contains(lastModalTrigger)) {
      lastModalTrigger.focus({ preventScroll: true });
    }
    lastModalTrigger = null;
  }

  /** Escape to dismiss, Tab cycled within the dialog. */
  function onModalKeydown(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      closeModal();
      return;
    }
    if (e.key !== "Tab") return;

    const nodes = Array.from(
      els.modalContainer.querySelectorAll(FOCUSABLE_SELECTOR)
    ).filter((el) => el.offsetParent !== null || el === document.activeElement);

    if (!nodes.length) return;

    const first = nodes[0];
    const last = nodes[nodes.length - 1];

    if (e.shiftKey && (document.activeElement === first || document.activeElement === els.modalContainer)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  /** Open Form CSR-1 with a Fast-Track theme pre-selected. */
  function openWithTheme(theme) {
    openModal(selectedId);
    if (!els.themeSelect) return;

    els.themeSelect.value = theme;
    // Confirm the value actually exists in the <select>; a mismatch between
    // a data-theme attribute and an <option value> would silently no-op.
    if (els.themeSelect.value !== theme) {
      console.warn("Unknown theme value:", theme);
      return;
    }
    els.themeSelect.focus({ preventScroll: false });
  }

  /* ======================================================================
     10 · FORM CSR-1 / EOI SUBMISSION & DATABASE INTEGRATION
     ====================================================================== */

  let submitting = false;

  async function submitToSupabase(payload) {
    if (typeof SUPABASE_URL !== "string" || !SUPABASE_URL.trim() ||
        typeof SUPABASE_ANON_KEY !== "string" || !SUPABASE_ANON_KEY.trim()) {
      return null;
    }

    const endpoint = SUPABASE_URL.replace(/\/+$/, "") + "/rest/v1/eoi_submissions";
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "apikey": SUPABASE_ANON_KEY.trim(),
        "Authorization": "Bearer " + SUPABASE_ANON_KEY.trim(),
        "Content-Type": "application/json",
        "Prefer": "return=representation"
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.warn("Supabase database error:", res.status, errText);
      throw new Error("Supabase insert returned status " + res.status);
    }

    const data = await res.json();
    return Array.isArray(data) ? data[0] : data;
  }

  function renderSubmissionReceipt(data) {
    if (!els.modalSuccessCard) return;

    if (els.receiptRef) els.receiptRef.textContent = data.appRef;
    if (els.receiptTimestamp) els.receiptTimestamp.textContent = "Recorded on " + data.timestamp;
    if (els.receiptSite) els.receiptSite.textContent = data.site;
    if (els.receiptOrg) els.receiptOrg.textContent = data.org;
    if (els.receiptSignatory) els.receiptSignatory.textContent = data.signatory;
    if (els.receiptContact) els.receiptContact.textContent = data.contact;
    if (els.receiptTheme) els.receiptTheme.textContent = data.theme;

    if (els.interestForm) els.interestForm.hidden = true;
    els.modalSuccessCard.hidden = false;

    if (els.modalContainer) els.modalContainer.scrollTop = 0;
  }

  async function handleFormSubmit(e) {
    e.preventDefault();
    if (submitting) return;

    // 0. Anti-bot honeypot verification: silently drop automated bot spam
    const botTrap = document.getElementById("botField");
    if (botTrap && botTrap.value.trim() !== "") {
      console.warn("Automated bot submission dropped by honeypot.");
      submitting = true;
      els.submitBtn.classList.add("is-busy");
      els.submitBtn.setAttribute("aria-busy", "true");
      setTimeout(() => {
        submitting = false;
        els.submitBtn.classList.remove("is-busy");
        els.submitBtn.removeAttribute("aria-busy");
        showToast("Your expression of interest has been submitted.");
        closeModal();
      }, 500);
      return;
    }

    // 1. Strict Indian mobile phone validation (10 digits starting with 6, 7, 8, or 9)
    let phoneVal = els.contactPhone ? els.contactPhone.value.trim() : "";
    phoneVal = phoneVal.replace(/\s+/g, "").replace(/-/g, "");
    if (phoneVal.startsWith("+91")) phoneVal = phoneVal.slice(3);
    else if (phoneVal.startsWith("91") && phoneVal.length > 10) phoneVal = phoneVal.slice(2);
    else if (phoneVal.startsWith("0") && phoneVal.length > 10) phoneVal = phoneVal.slice(1);
    phoneVal = phoneVal.replace(/\D/g, "").slice(0, 10);
    if (els.contactPhone) els.contactPhone.value = phoneVal;

    if (!/^[6-9]\d{9}$/.test(phoneVal)) {
      if (els.contactPhone) {
        if (!phoneVal) {
          els.contactPhone.setCustomValidity("Please enter your 10-digit mobile number.");
        } else if (!/^[6-9]/.test(phoneVal)) {
          els.contactPhone.setCustomValidity("Indian mobile numbers must start with 6, 7, 8, or 9.");
        } else {
          els.contactPhone.setCustomValidity("Please enter a complete 10-digit Indian mobile number.");
        }
        els.contactPhone.reportValidity();
      }
      return;
    } else if (els.contactPhone) {
      els.contactPhone.setCustomValidity("");
    }

    // Let the browser surface its own validation messages for other fields first.
    if (!els.interestForm.checkValidity()) {
      els.interestForm.reportValidity();
      return;
    }

    submitting = true;
    els.submitBtn.classList.add("is-busy");
    els.submitBtn.setAttribute("aria-busy", "true");
    const originalLabel = els.submitBtnLabel.textContent;
    els.submitBtnLabel.textContent = "Recording in database…";

    const org = els.orgName.value.trim();
    const orgType = els.orgType ? els.orgType.value : "Corporate";
    const contact = els.contactName.value.trim();
    const role = els.contactRole.value.trim();
    const email = els.contactEmail.value.trim();
    const phone = "+91 " + phoneVal;
    const site = els.siteOfInterest.value.trim();
    const theme = els.themeSelect ? els.themeSelect.value : "Standard Civic Beautification";
    const budget = els.budgetRange ? els.budgetRange.value : "₹5L–10L";
    const tenure = els.proposedDuration ? els.proposedDuration.value : "3 Years";
    const message = els.contactMessage.value.trim();

    const isPriorityTheme = theme !== "Standard Civic Beautification";

    const scopes = [];
    document.querySelectorAll("input[name='scope[]']:checked").forEach((cb) => {
      scopes.push(cb.value);
    });

    const appRef =
      "MCL/CSR/" + new Date().getFullYear() + "/" + (selectedId || "GEN") + "-" +
      Math.floor(1000 + Math.random() * 9000);

    const siteObj = selectedId ? ALL_SITES.find((s) => s.id === selectedId) : null;
    const dbPayload = {
      application_reference: appRef,
      park_id: siteObj ? siteObj.id : null,
      park_name: siteObj ? siteObj.name : "City-Wide Green Initiative",
      zone: siteObj ? siteObj.zone : null,
      ward: siteObj && siteObj.ward ? String(siteObj.ward) : null,
      is_citywide: !siteObj,
      organization: org,
      org_type: orgType,
      contact_person: contact,
      contact_role: role,
      email: email,
      phone: phone,
      theme_concept: theme,
      is_priority_theme: isPriorityTheme,
      scope: scopes,
      budget_range: budget,
      adoption_tenure: tenure,
      message: message || null,
      status: "Submitted"
    };

    let supabaseSaved = false;

    // --- 1. Supabase PostgreSQL submission ------------------------------
    try {
      if (typeof SUPABASE_URL === "string" && SUPABASE_URL.trim() &&
          typeof SUPABASE_ANON_KEY === "string" && SUPABASE_ANON_KEY.trim()) {
        const saved = await submitToSupabase(dbPayload);
        if (saved) supabaseSaved = true;
      }
    } catch (dbErr) {
      console.warn("Supabase database insert could not complete, falling back:", dbErr);
    }

    // --- 2. Netlify Forms capture (fire and forget redundancy) -----------
    try {
      const formData = new FormData(els.interestForm);
      formData.set("phone", phone);
      formData.append("application_reference", appRef);
      formData.append("is_priority_theme", isPriorityTheme ? "YES" : "NO");
      fetch("/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(formData).toString(),
      }).catch(() => {});
    } catch (err) {
      /* Never block the applicant on the capture endpoint. */
    }

    // --- 3. UI Resolution: Show Official Receipt if saved to Database ---
    if (supabaseSaved) {
      submitting = false;
      els.submitBtn.classList.remove("is-busy");
      els.submitBtn.removeAttribute("aria-busy");
      els.submitBtnLabel.textContent = originalLabel;

      renderSubmissionReceipt({
        appRef,
        site: siteObj ? siteObj.name + " (" + siteObj.id + ")" : "City-Wide Green Initiative",
        org: org + " (" + orgType + ")",
        signatory: contact + (role ? " (" + role + ")" : ""),
        contact: phone + " · " + email,
        theme: theme + " · Budget: " + budget + " · Tenure: " + tenure,
        timestamp: new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })
      });

      showToast("Proposal " + appRef + " securely recorded in database.");
      return;
    }

    // --- 4. Fallback (if Supabase not configured yet): mailto draft -----
    const subject =
      "[PARK ADOPTION / EOI] " + (isPriorityTheme ? "[PRIORITY THEME] " : "") +
      theme + " — " + org + " (" + orgType + ") [Ref " + appRef + "]";

    const body = [
      "===============================================================",
      "MUNICIPAL CORPORATION LUDHIANA — PARK ADOPTION & STEWARDSHIP (EOI)",
      "Estate & Horticulture Wing",
      "===============================================================",
      "Application Reference: " + appRef,
      "Date of Submission   : " + new Date().toLocaleString("en-IN"),
      "Review Priority      : " + (isPriorityTheme
        ? "HIGH PRIORITY (Theme-Based Innovation Allotment)"
        : "Standard Civic Review"),
      "",
      "1. APPLICANT DETAILS:",
      "   Organisation Name : " + org,
      "   Applicant Category: " + orgType,
      "   Authorized Person : " + contact + (role ? " (" + role + ")" : ""),
      "   Email Address     : " + email,
      "   Contact Number    : " + phone,
      "",
      "2. PROPOSAL & THEME DETAILS:",
      "   Subject Site / Ref: " + site,
      "   Theme Concept     : " + theme + (isPriorityTheme ? " [PRIORITY CONCEPT]" : ""),
      "   Proposed Scope    : " + (scopes.join(", ") || "General Maintenance & Greening"),
      "   Estimated Budget  : " + budget,
      "   Proposed Tenure   : " + tenure,
      "",
      "3. IMPLEMENTATION & CONCEPT NOTES:",
      "   " + (message || "Park greening & stewardship proposal as per MCL terms."),
      "",
      "---------------------------------------------------------------",
      "Declaration: The applicant confirms the submission is authentic and",
      "conforms to the MCL Public Park Adoption Policy.",
      "===============================================================",
    ].join("\n");

    const recipient = typeof CONTACT_EMAIL === "string" ? CONTACT_EMAIL : "";
    window.location.href =
      "mailto:" + recipient +
      "?subject=" + encodeURIComponent(subject) +
      "&body=" + encodeURIComponent(body);

    showToast("Adoption proposal " + appRef + " recorded. Opening email draft…");

    setTimeout(() => {
      submitting = false;
      els.submitBtn.classList.remove("is-busy");
      els.submitBtn.removeAttribute("aria-busy");
      els.submitBtnLabel.textContent = originalLabel;
      closeModal();
    }, 1200);
  }

  /* ======================================================================
     11 · DERIVED PANELS  (impact meters, stewardship list)
     Every figure below is computed from parks_data.json. Nothing is
     hand-authored, so these panels cannot drift from the register.
     ====================================================================== */

  function buildImpactPanels() {
    buildZoneMeter();
    buildFootfallMeter();
    buildFigureStack();
    if (window.Motion) {
      window.Motion.armMeters(document.getElementById("impact"));
    }
  }

  function buildZoneMeter() {
    if (!els.meterZones) return;

    const counts = { A: 0, B: 0, C: 0, D: 0 };
    const acres = { A: 0, B: 0, C: 0, D: 0 };
    for (const s of ALL_SITES) {
      if (counts[s.zone] === undefined) continue;
      counts[s.zone]++;
      acres[s.zone] += (s.area_sqm || 0) / SQM_PER_ACRE;
    }

    const max = Math.max(...Object.values(counts)) || 1;
    const rows = ["A", "B", "C", "D"].map((z, i) => ({
      variant: ["a", "b", "c", "d"][i],
      name: "Zone " + z,
      value: counts[z].toLocaleString("en-IN") + " sites · " + acres[z].toFixed(0) + " ac",
      fill: counts[z] / max,
      index: i,
    }));

    els.meterZones.replaceChildren(buildMeterRows(rows));
  }

  function buildFootfallMeter() {
    if (!els.meterFootfall) return;

    // Labels mirror the dataset's own footfall bands.
    const bands = [
      { key: "200-500+", name: "High — 200 to 500+ daily" },
      { key: "50-200", name: "Medium — 50 to 200 daily" },
      { key: "0-50", name: "Local — under 50 daily" },
    ];

    const counts = Object.create(null);
    for (const s of ALL_SITES) counts[s.footfall] = (counts[s.footfall] || 0) + 1;

    const max = Math.max(...bands.map((b) => counts[b.key] || 0)) || 1;
    const total = ALL_SITES.length;

    const rows = bands.map((b, i) => {
      const n = counts[b.key] || 0;
      return {
        variant: ["a", "b", "c"][i],
        name: b.name,
        value: n.toLocaleString("en-IN") + " sites · " + Math.round((n / total) * 100) + "%",
        fill: n / max,
        index: i,
      };
    });

    els.meterFootfall.replaceChildren(buildMeterRows(rows));
  }

  function buildMeterRows(rows) {
    const frag = document.createDocumentFragment();
    for (const r of rows) {
      const row = document.createElement("div");
      row.className = "meter__row meter__row--" + r.variant;
      row.dataset.fill = r.fill.toFixed(4);
      row.style.setProperty("--i", String(r.index));

      const name = document.createElement("span");
      name.className = "meter__name";
      name.textContent = r.name;

      const val = document.createElement("span");
      val.className = "meter__val";
      val.textContent = r.value;

      /* The bar is decorative — the same information is already in the
         adjacent text — so it is hidden from assistive technology rather
         than given redundant ARIA meter semantics. */
      const track = document.createElement("div");
      track.className = "meter__track";
      track.setAttribute("aria-hidden", "true");
      const fill = document.createElement("div");
      fill.className = "meter__fill";
      track.appendChild(fill);

      row.append(name, val, track);
      frag.appendChild(row);
    }
    return frag;
  }

  function buildFigureStack() {
    if (!els.figureStack) return;

    let availableAcres = 0, availableCount = 0, largest = 0, totalAcres = 0;
    const wards = new Set();

    for (const s of ALL_SITES) {
      const ac = (s.area_sqm || 0) / SQM_PER_ACRE;
      totalAcres += ac;
      if (s.ward) wards.add(s.ward);
      if (ac > largest) largest = ac;
      if (s.status === "Available") {
        availableCount++;
        availableAcres += ac;
      }
    }

    const figures = [
      { value: availableAcres.toFixed(1), unit: "acres", label: "Green cover open for immediate adoption" },
      { value: (availableAcres / (availableCount || 1)).toFixed(2), unit: "acres", label: "Average size of an available site" },
      { value: largest.toFixed(1), unit: "acres", label: "Largest single site in the register" },
      { value: String(wards.size), unit: "wards", label: "Municipal wards covered across four zones" },
      { value: totalAcres.toFixed(1), unit: "acres", label: "Total municipal green cover on record" },
    ];

    const frag = document.createDocumentFragment();
    for (const f of figures) {
      const fig = document.createElement("div");
      fig.className = "figure";

      const val = document.createElement("span");
      val.className = "figure__val num";
      val.textContent = f.value;
      const unit = document.createElement("span");
      unit.className = "unit";
      unit.textContent = f.unit;
      val.appendChild(unit);

      const label = document.createElement("span");
      label.className = "figure__label";
      label.textContent = f.label;

      fig.append(val, label);
      frag.appendChild(fig);
    }
    els.figureStack.replaceChildren(frag);
  }

  /**
   * Sites already under CSR agreement.
   * The register records the custodianship category ("CORPORATE") but not
   * the partner organisation, so only recorded facts are published here —
   * no invented partner names, logos or success narratives.
   */
  function buildStewardshipList() {
    if (!els.stewardshipList) return;

    const adopted = ALL_SITES
      .filter((s) => s.status === "Adopted")
      .sort((a, b) => (b.area_sqm || 0) - (a.area_sqm || 0))
      .slice(0, 12);

    if (!adopted.length) {
      els.stewardshipList.replaceChildren();
      return;
    }

    const frag = document.createDocumentFragment();
    adopted.forEach((s, i) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "steward-card card--lift reveal";
      card.style.setProperty("--i", String(i % 4));
      card.dataset.id = s.id;
      card.setAttribute("aria-label", "Open dossier for " + s.name);

      const name = document.createElement("span");
      name.className = "steward-card__name";
      name.textContent = s.name;

      const meta = document.createElement("span");
      meta.className = "steward-card__meta";
      meta.append(
        tag("", "Zone " + s.zone),
        tag("", s.ward ? "Ward " + s.ward : "Ward —"),
        tag("", formatArea(s.area_sqm)),
        tag("", s.contract_end ? "Until " + s.contract_end : "Active")
      );

      card.append(name, meta);
      frag.appendChild(card);
    });

    els.stewardshipList.replaceChildren(frag);
    if (window.Motion) window.Motion.armReveals(els.stewardshipList);
  }

  /* ======================================================================
     12 · TOAST
     ====================================================================== */

  let toastTimer = null;

  function showToast(message, variant) {
    if (!els.toast) return;

    clearTimeout(toastTimer);
    els.toast.className = "toast" + (variant === "warn" ? " toast--warn" : "");

    // Icon, then the message as text (never innerHTML — the message can
    // contain a park name straight from the dataset).
    els.toast.innerHTML =
      '<svg aria-hidden="true" focusable="false"><use href="#i-' +
      (variant === "warn" ? "info" : "check") + '"></use></svg>';
    const text = document.createElement("span");
    text.textContent = message;
    els.toast.appendChild(text);

    els.toast.hidden = false;

    toastTimer = setTimeout(() => { els.toast.hidden = true; }, 5000);
  }

  /* ======================================================================
     EVENT WIRING
     ====================================================================== */

  function bindEvents() {
    // ---- View switch (Cards, Split / Map, Full Map, Table) ----------
    if (els.viewCardsBtn) els.viewCardsBtn.addEventListener("click", () => switchView("cards"));
    if (els.viewSplitBtn) els.viewSplitBtn.addEventListener("click", () => switchView("split"));
    if (els.viewMapBtn) els.viewMapBtn.addEventListener("click", () => switchView("map"));
    if (els.viewTableBtn) els.viewTableBtn.addEventListener("click", () => switchView("table"));

    // ---- Search -----------------------------------------------------
    const debouncedFilter = debounce(applyFilters, 120);
    els.searchInput.addEventListener("input", () => {
      els.searchClear.hidden = !els.searchInput.value;
      debouncedFilter();
    });
    // Enter should not submit anything or reload; just apply immediately.
    els.searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); applyFilters(); }
    });
    els.searchClear.addEventListener("click", () => {
      els.searchInput.value = "";
      els.searchClear.hidden = true;
      applyFilters();
      els.searchInput.focus();
    });

    // ---- Status radiogroup ------------------------------------------
    els.statusTabs.addEventListener("click", (e) => {
      const tab = e.target.closest(".status-tab");
      if (!tab) return;
      selectedStatus = tab.dataset.status;
      setStatusChecked(selectedStatus);
      applyFilters();
    });
    els.statusTabs.addEventListener("keydown", onStatusKeydown);

    // ---- Selects ----------------------------------------------------
    els.zoneSelect.addEventListener("change", (e) => { selectedZone = e.target.value; applyFilters(); });
    els.wardSelect.addEventListener("change", (e) => { selectedWard = e.target.value; applyFilters(); });
    els.categorySelect.addEventListener("change", (e) => { selectedCategory = e.target.value; applyFilters(); });
    els.sortSelect.addEventListener("change", () => applyFilters());

    // ---- Reset & export ---------------------------------------------
    els.resetFilters.addEventListener("click", resetAllFilters);
    els.btnExportCsv.addEventListener("click", exportFilteredToCSV);
    if (els.exportFooterBtn) els.exportFooterBtn.addEventListener("click", exportFilteredToCSV);

    // ---- Result delegation (cards + table action buttons) -----------
    els.siteList.addEventListener("click", (e) => {
      const card = e.target.closest(".site-card");
      if (card && card.dataset.id) openModal(card.dataset.id);
    });
    if (els.tableBody) {
      els.tableBody.addEventListener("click", (e) => {
        const btn = e.target.closest(".btn-table-action");
        if (btn && btn.dataset.id) openModal(btn.dataset.id);
      });
    }
    if (els.stewardshipList) {
      els.stewardshipList.addEventListener("click", (e) => {
        const card = e.target.closest(".steward-card");
        if (card && card.dataset.id) openModal(card.dataset.id);
      });
    }

    // ---- Internal pane scrolling (auto-loads batches without moving main page) -
    let autoLoading = false;
    function checkAutoLoad(el) {
      if (autoLoading || !el) return;
      const { scrollTop, scrollHeight, clientHeight } = el;
      if (scrollTop + clientHeight >= scrollHeight - 320) {
        if (renderLimit < FILTERED_SITES.length) {
          autoLoading = true;
          renderLimit += RENDER_CHUNK;
          renderViews();
          setTimeout(() => { autoLoading = false; }, 120);
        }
      }
    }

    if (els.resultsCardsPane) {
      els.resultsCardsPane.addEventListener("scroll", () => checkAutoLoad(els.resultsCardsPane), { passive: true });
    }
    if (els.tableContainer) {
      els.tableContainer.addEventListener("scroll", () => checkAutoLoad(els.tableContainer), { passive: true });
    }
    if (els.gisSplitList) {
      els.gisSplitList.addEventListener("scroll", () => checkAutoLoad(els.gisSplitList), { passive: true });
    }

    // ---- Mobile filter sheet ----------------------------------------
    if (els.filtersOpenBtn) els.filtersOpenBtn.addEventListener("click", openFilterSheet);
    if (els.filtersCloseBtn) els.filtersCloseBtn.addEventListener("click", closeFilterSheet);
    if (els.filtersScrim) els.filtersScrim.addEventListener("click", closeFilterSheet);
    if (els.filtersApplyBtn) els.filtersApplyBtn.addEventListener("click", closeFilterSheet);

    // ---- Modal ------------------------------------------------------
    els.modalClose.addEventListener("click", closeModal);
    els.modalOverlay.addEventListener("click", (e) => {
      if (e.target === els.modalOverlay) closeModal();
    });
    els.interestForm.addEventListener("submit", handleFormSubmit);

    // Receipt actions (copy ref, print receipt, close)
    if (els.receiptCopyBtn && els.receiptRef) {
      els.receiptCopyBtn.addEventListener("click", () => {
        const ref = els.receiptRef.textContent.trim();
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(ref).then(() => {
            showToast("Reference copied: " + ref);
          }).catch(() => {
            showToast("Reference: " + ref);
          });
        } else {
          showToast("Reference: " + ref);
        }
      });
    }
    if (els.receiptPrintBtn) {
      els.receiptPrintBtn.addEventListener("click", () => window.print());
    }
    if (els.receiptCloseBtn) {
      els.receiptCloseBtn.addEventListener("click", closeModal);
    }

    // Strict Indian mobile phone formatting & live input validation
    if (els.contactPhone) {
      els.contactPhone.addEventListener("input", () => {
        let val = els.contactPhone.value;
        // Strip common prefixes +91 or leading 0, spaces, dashes
        val = val.replace(/\s+/g, "").replace(/-/g, "");
        if (val.startsWith("+91")) val = val.slice(3);
        else if (val.startsWith("91") && val.length > 10) val = val.slice(2);
        else if (val.startsWith("0") && val.length > 10) val = val.slice(1);

        // Keep strictly digits, max 10
        val = val.replace(/\D/g, "").slice(0, 10);
        els.contactPhone.value = val;

        if (!val) {
          els.contactPhone.setCustomValidity("");
        } else if (!/^[6-9]/.test(val)) {
          els.contactPhone.setCustomValidity("Indian mobile numbers must start with 6, 7, 8, or 9.");
        } else if (val.length < 10) {
          els.contactPhone.setCustomValidity("Please enter all 10 digits (currently " + val.length + " of 10).");
        } else {
          els.contactPhone.setCustomValidity("");
        }
      });

      els.contactPhone.addEventListener("blur", () => {
        if (els.contactPhone.value && els.contactPhone.value.length < 10) {
          els.contactPhone.reportValidity();
        }
      });
    }

    // Modal locate button: zooms directly to site on GIS map
    if (els.modalLocateGis) {
      els.modalLocateGis.addEventListener("click", () => {
        const site = ALL_SITES.find((s) => s.id === selectedId);
        closeModal();
        if (site) focusSiteOnMap(site);
      });
    }

    // Global Escape: closes whichever layer is open (modal handles its own).
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && isFilterSheetOpen()) closeFilterSheet();
    });

    // ---- Form CSR-1 entry points ------------------------------------
    [els.openInterestGlobal, els.openInterestFooter, els.openInterestFooter2].forEach((btn) => {
      if (btn) btn.addEventListener("click", () => openModal(null));
    });

    // ---- Fast-Track theme selection ---------------------------------
    document.querySelectorAll(".btn-theme-select, .theme-chip").forEach((btn) => {
      btn.addEventListener("click", () => openWithTheme(btn.dataset.theme));
    });

    // ---- Hash navigation (#gis) -------------------------------------
    function checkHash() {
      if (window.location.hash === "#gis") {
        switchView("split");
        const reg = document.getElementById("registry");
        if (reg) reg.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
    window.addEventListener("hashchange", checkHash);
    if (window.location.hash === "#gis") checkHash();
  }

  // Global helpers for Leaflet HTML popups
  window.__portalOpenModal = function (id) {
    openModal(id);
  };
  window.__portalOpenEoi = function (id) {
    openModal(id);
  };

  /* ---------------------------------------------------------------------- */

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }

  // Exposed only for the inline reset button rendered in the empty state
  // of older cached pages. Safe to remove after one deploy cycle.
  window.resetAllFilters = resetAllFilters;
})();
