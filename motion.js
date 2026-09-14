/* ==========================================================================
   MCL PARK ADOPTION PORTAL — MOTION LAYER
   Municipal Corporation Ludhiana

   Deliberately isolated from script.js. Everything here is presentational:
   deleting this file leaves the portal fully functional — every stat shows
   its final value, every section is visible, nothing becomes unreachable.

   Design rules enforced throughout:
     · Only `opacity` and `transform` are ever animated (compositor-only,
       no layout or paint work, no jank on the main thread).
     · `prefers-reduced-motion: reduce` short-circuits every effect. Values
       resolve instantly to their final state.
     · No effect gates interaction. Filtering, searching, submitting and
       scrolling are never blocked or delayed by an animation.
     · Parallax is desktop-and-pointer only; on touch/small screens it is
       skipped entirely (scroll-linked transforms fight momentum scrolling).

   Exposes a tiny global, `Motion`, so script.js can register the nodes it
   creates at runtime (impact meters, stewardship cards).
   ========================================================================== */

(function () {
  "use strict";

  /* ------------------------------------------------------------------
     Capability & preference detection
     ------------------------------------------------------------------ */

  const reduceMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const supportsObserver = "IntersectionObserver" in window;

  let prefersReduced = reduceMotionQuery.matches;

  /* Hero parallax kill switch.
     Re-enabled now that the "falling band" artefact is fixed at its source
     (a GPU compositing configuration — permanent `will-change` on
     negative-z-index layers, read back by `backdrop-filter`; see style.css
     §07 for the full account). Nothing was ever moving on a timer.

     Two independent ways to switch the effect off, both still supported:
       · set this flag to false, or
       · add the `disable-fall` class to <html>.
     The CSS class is the more complete of the two: it also neutralises the
     transforms and the layer-promotion hint, which a JS flag alone cannot
     reach. Reach for it first if a specific device ever misbehaves. */
  const ENABLE_PARALLAX = true;

  /** Coarse pointer or narrow viewport ⇒ no parallax. */
  function parallaxAllowed() {
    return (
      ENABLE_PARALLAX &&
      !prefersReduced &&
      // Read live, not cached, so toggling the class from the console takes
      // effect on the very next frame.
      !document.documentElement.classList.contains("disable-fall") &&
      window.matchMedia("(min-width: 768px)").matches &&
      window.matchMedia("(hover: hover)").matches
    );
  }

  /* ------------------------------------------------------------------
     Scroll-linked reveals

     Elements carry `.reveal` in the markup and are visible by default.
     `html.js-reveal` (set by the inline head script) is what actually
     hides them, so a JS or network failure can never leave content
     invisible. Stagger comes from the CSS custom property `--i`.
     ------------------------------------------------------------------ */

  let revealObserver = null;

  function revealNow(el) {
    el.classList.add("is-in");
    el.classList.remove("reveal-armed");
  }

  function initReveals() {
    // No observer support, or the user asked for less motion: resolve all
    // reveals immediately and never arm another.
    if (!supportsObserver || prefersReduced) {
      document.documentElement.classList.remove("js-reveal");
      document.querySelectorAll(".reveal").forEach(revealNow);
      return;
    }

    revealObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          revealNow(entry.target);
          revealObserver.unobserve(entry.target);
        }
      },
      {
        // Fire slightly before the element's edge clears the fold so the
        // transition has begun by the time it is properly on screen.
        rootMargin: "0px 0px -8% 0px",
        threshold: 0.08,
      }
    );

    arm(document.querySelectorAll(".reveal"));
  }

  /**
   * Arm a set of reveal elements. Anything already within the viewport is
   * resolved immediately rather than animated — animating content that is
   * already visible reads as a glitch on first paint.
   */
  function arm(nodes) {
    if (!revealObserver) {
      nodes.forEach(revealNow);
      return;
    }
    const fold = window.innerHeight;
    nodes.forEach((el) => {
      if (el.classList.contains("is-in")) return;
      const top = el.getBoundingClientRect().top;
      if (top < fold * 0.92) {
        revealNow(el);
      } else {
        el.classList.add("reveal-armed");
        revealObserver.observe(el);
      }
    });
  }

  /* Release the compositor layer once a reveal has finished. Holding
     `will-change` on dozens of nodes for the life of the page wastes GPU
     memory; the CSS drops it when `.reveal-armed` is gone. */
  document.addEventListener(
    "transitionend",
    (e) => {
      if (e.target instanceof Element && e.target.classList.contains("reveal")) {
        e.target.classList.remove("reveal-armed");
      }
    },
    true
  );

  /* ------------------------------------------------------------------
     Statistic count-up

     The final figure is already in the DOM (rendered in the markup, then
     re-confirmed from parks_data.json by script.js). This only animates
     from zero up to whatever `data-count-to` holds at the moment the band
     scrolls into view, so it can never display a stale or wrong number.
     ------------------------------------------------------------------ */

  const COUNT_DURATION = 1500;

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function runCountUp(el) {
    const target = parseFloat(el.dataset.countTo);
    if (!Number.isFinite(target)) return;

    const decimals = parseInt(el.dataset.countDecimals || "0", 10);

    // Reduced motion: the value is already correct, just make sure it is
    // formatted consistently and stop.
    if (prefersReduced) {
      el.textContent = format(target, decimals);
      return;
    }

    const started = performance.now();

    function frame(now) {
      const t = Math.min((now - started) / COUNT_DURATION, 1);
      el.textContent = format(target * easeOutCubic(t), decimals);
      if (t < 1) requestAnimationFrame(frame);
      else el.textContent = format(target, decimals);
    }
    requestAnimationFrame(frame);
  }

  function format(value, decimals) {
    return decimals > 0
      ? value.toFixed(decimals)
      : Math.round(value).toLocaleString("en-IN");
  }

  function initCounters() {
    const band = document.getElementById("stats");
    if (!band) return;

    const targets = band.querySelectorAll("[data-count-to]");
    if (!targets.length) return;

    if (!supportsObserver || prefersReduced) {
      targets.forEach(runCountUp);
      return;
    }

    const io = new IntersectionObserver(
      (entries, obs) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          targets.forEach(runCountUp);
          obs.disconnect();
        }
      },
      { threshold: 0.3 }
    );
    io.observe(band);
  }

  /* ------------------------------------------------------------------
     Distribution meters

     Bars animate with `transform: scaleX()` rather than `width` so the
     fill never triggers layout. script.js builds the rows and sets
     `data-fill` (0–1); this only decides when to release them.
     ------------------------------------------------------------------ */

  function fillMeter(row) {
    const bar = row.querySelector(".meter__fill");
    if (!bar) return;
    const ratio = parseFloat(row.dataset.fill || "0");
    bar.style.setProperty("--fill", Math.max(0, Math.min(1, ratio)).toFixed(4));
  }

  let meterObserver = null;

  function initMeters() {
    if (!supportsObserver || prefersReduced) return; // handled by armMeters
    meterObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          fillMeter(entry.target);
          meterObserver.unobserve(entry.target);
        }
      },
      { threshold: 0.35 }
    );
  }

  function armMeters(rows) {
    rows.forEach((row) => {
      if (!meterObserver) {
        fillMeter(row); // resolves instantly; CSS transition is 0s here
        return;
      }
      meterObserver.observe(row);
    });
  }

  /* ------------------------------------------------------------------
     Hero parallax

     A single rAF loop writes one custom property (`--hero-p`, 0→1) on the
     hero element; the CSS in §07 decides how far each layer moves. One
     property write per frame, no per-layer style thrash, and the loop only
     runs while the hero is actually on screen.
     ------------------------------------------------------------------ */

  function initParallax() {
    const hero = document.getElementById("hero");
    if (!hero) return;

    /* Start every layer at rest. From here on the effect is gated solely by
       parallaxAllowed(), which is consulted before start() and again on every
       frame — so both the ENABLE_PARALLAX flag and the `disable-fall` class
       can be flipped in either direction at runtime and be honoured. */
    hero.style.setProperty("--hero-p", "0");

    let running = false;
    let queued = false;
    let heroHeight = hero.offsetHeight || 1;

    function measure() {
      heroHeight = hero.offsetHeight || 1;
    }

    function update() {
      queued = false;
      // Re-check every frame so `disable-fall` (or a reduced-motion change)
      // takes effect immediately rather than at the next scroll boundary.
      if (!parallaxAllowed()) {
        stop();
        return;
      }
      // Progress through the hero's own scroll range, clamped 0–1.
      const progress = Math.min(Math.max(window.scrollY / heroHeight, 0), 1);
      hero.style.setProperty("--hero-p", progress.toFixed(4));
    }

    function onScroll() {
      if (!running || queued) return;
      queued = true;
      requestAnimationFrame(update);
    }

    function start() {
      if (running || !parallaxAllowed()) return;
      running = true;
      measure();
      /* Promote the decorative layers ONLY for as long as the loop runs.
         The CSS hint lives behind `.hero.is-parallax-active .parallax`, so
         the moment this class comes off, the three layers drop back to
         ordinary painting. Holding `will-change: transform` on them for the
         life of the page was the root cause of the compositing artefact
         documented in style.css §07 — and being pure CSS, it survived every
         JS-side attempt to switch the effect off. */
      hero.classList.add("is-parallax-active");
      window.addEventListener("scroll", onScroll, { passive: true });
      update();
    }

    function stop() {
      if (!running) return;
      running = false;
      window.removeEventListener("scroll", onScroll);
      hero.classList.remove("is-parallax-active");
      // Return every layer to its untransformed rest position.
      hero.style.setProperty("--hero-p", "0");
    }

    // Only pay for the scroll listener while the hero is in view.
    if (supportsObserver) {
      new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) start();
            else stop();
          }
        },
        { threshold: 0 }
      ).observe(hero);
    } else {
      start();
    }

    window.addEventListener("resize", () => {
      measure();
      // A resize can cross the parallax-allowed threshold in either
      // direction (e.g. rotating a tablet).
      if (parallaxAllowed()) start();
      else stop();
    }, { passive: true });
  }

  /* ------------------------------------------------------------------
     Masthead: publish its real height, and shadow it once scrolled

     `--masthead-h` is consumed by scroll-padding-top, the sticky filter
     rail offset and the mobile filter bar. Measuring it rather than
     hard-coding keeps anchor targets correct when the brand text wraps.
     ------------------------------------------------------------------ */

  function initMasthead() {
    const header = document.getElementById("masthead");
    if (!header) return;

    let lastHeight = -1;
    function publishHeight() {
      const h = Math.round(header.offsetHeight);
      if (h === lastHeight || h <= 0) return;
      lastHeight = h;
      document.documentElement.style.setProperty(
        "--masthead-h",
        h + "px"
      );
    }
    publishHeight();

    if ("ResizeObserver" in window) {
      new ResizeObserver(publishHeight).observe(header);
    } else {
      window.addEventListener("resize", publishHeight, { passive: true });
    }

    // Elevation only after the page has actually moved.
    let stuck = false;
    function onScroll() {
      const next = window.scrollY > 8;
      if (next === stuck) return;
      stuck = next;
      header.classList.toggle("is-stuck", stuck);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  /* ------------------------------------------------------------------
     Respond to a live change of the motion preference

     Users can toggle "reduce motion" at the OS level with the page open.
     Honour it immediately rather than only on reload.
     ------------------------------------------------------------------ */

  function watchMotionPreference() {
    const handler = (e) => {
      prefersReduced = e.matches;
      if (prefersReduced) {
        document.documentElement.classList.remove("js-reveal");
        document.querySelectorAll(".reveal").forEach(revealNow);
        document.querySelectorAll(".meter__row").forEach(fillMeter);
        const hero = document.getElementById("hero");
        if (hero) hero.style.setProperty("--hero-p", "0");
      }
    };
    if (reduceMotionQuery.addEventListener) {
      reduceMotionQuery.addEventListener("change", handler);
    } else if (reduceMotionQuery.addListener) {
      reduceMotionQuery.addListener(handler); // Safari < 14
    }
  }

  /* ------------------------------------------------------------------
     Public surface for script.js
     ------------------------------------------------------------------ */

  window.Motion = {
    /** Register reveal elements created after first paint. */
    armReveals(root) {
      const scope = root || document;
      arm(scope.querySelectorAll(".reveal:not(.is-in)"));
    },
    /** Register meter rows created after first paint. */
    armMeters(root) {
      const scope = root || document;
      armMeters(Array.from(scope.querySelectorAll(".meter__row")));
    },
    get prefersReducedMotion() {
      return prefersReduced;
    },
  };

  /* ------------------------------------------------------------------
     Boot
     ------------------------------------------------------------------ */

  function boot() {
    initMasthead();
    initMeters();
    initReveals();
    initCounters();
    initParallax();
    watchMotionPreference();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
