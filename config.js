// ---------------------------------------------------------------------------
// MCL PARK ADOPTION PORTAL — DEPLOYMENT CONFIGURATION
// Municipal Corporation Ludhiana
//
// This file is loaded before script.js and declares two globals it reads:
// GOOGLE_MAPS_API_KEY and CONTACT_EMAIL.
// ---------------------------------------------------------------------------


// ===========================================================================
// 1. GOOGLE MAPS API KEY
// ===========================================================================
//
// Enable on the key: "Maps JavaScript API" and "Street View Static API".
//
// Set to an empty string to run the portal without any mapping. Everything
// else — the 918-site register, search, zone/ward/type filters, sorting, CSV
// export and Form CSR-1 — is fully operational without a key. The GIS panel
// then shows a clearly-labelled "pending activation" notice rather than a
// broken or placeholder map.
//
// ---------------------------------------------------------------------------
// !! SECURITY — PLEASE READ AND ACTION !!
// ---------------------------------------------------------------------------
// This file is served to every visitor as plain text, so the key below is
// PUBLIC. That is unavoidable for the Maps JavaScript API (the browser must
// present it), which is exactly why Google requires you to restrict it.
//
// If this key is NOT restricted, anyone can copy it from the page source and
// bill their own usage to the Municipal Corporation's Google Cloud account.
//
// In the Google Cloud console → Credentials → this key, set BOTH:
//
//   Application restrictions → Websites (HTTP referrers), listing only:
//       https://parksldh.in/*
//       https://www.parksldh.in/*
//       (add http://localhost:*/*  only while developing)
//
//   API restrictions → Restrict key → Maps JavaScript API,
//                                     Street View Static API
//
// Also set a daily quota cap on both APIs so a leak cannot run up an
// unbounded bill. If this key was ever committed to a public repository,
// rotate it: create a new restricted key, paste it here, then delete the old
// The portal's main interactive GIS map and the dossier aerial preview both
// run 100% keyless via Leaflet, OpenStreetMap, and Esri World Imagery.
// An API key is NOT required. Set to "" for zero-cost, keyless operation.
// ---------------------------------------------------------------------------
const GOOGLE_MAPS_API_KEY = "";


// ===========================================================================
// 2. RECIPIENT FOR FORM CSR-1 SUBMISSIONS
// ===========================================================================
//
// On submit, the portal does two things:
//   a) POSTs the full form to "/" for Netlify Forms capture, and
//   b) opens a pre-formatted email draft to the address below.
//
// Replace this with the official Horticulture Cell mailbox before wider
// release — a personal Gmail address on a statutory civic portal undermines
// the credibility of the submission channel and creates a single point of
// failure if that account is lost. It also appears in the page footer.
const CONTACT_EMAIL = "commissionermcl@gmail.com";


// ===========================================================================
// 3. SUPABASE DATABASE CONFIGURATION (POSTGRESQL SERVERLESS)
// ===========================================================================
//
// In your Supabase Project (https://supabase.com/dashboard) -> Project Settings -> API:
//   - Project URL -> paste into SUPABASE_URL
//   - Project API keys -> anon (public) -> paste into SUPABASE_ANON_KEY
//
// When set, all Expression of Interest (EOI) submissions are instantly saved
// to the "eoi_submissions" table in your Supabase PostgreSQL database.
// If left empty or invalid, the portal falls back gracefully to the backup
// submission channel without disrupting the applicant.
// ===========================================================================
const SUPABASE_URL = "https://jkcwxixqwtxrlbfhtntn.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImprY3d4aXhxd3R4cmxiZmh0bnRuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk0ODMyOTEsImV4cCI6MjEwNTA1OTI5MX0.FKjaRP7tRbQ9gWyd6eIJo_w94Pn39IrkRpjtpOfBx-w";

