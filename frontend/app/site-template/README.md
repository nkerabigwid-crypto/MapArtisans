# Website template that helps artisans rank among the top 3 on Google Maps

A single-business, server-rendered marketing site template for local artisans
(plumbers, electricians, locksmiths, HVAC) — built to convert local search
traffic into calls, and structured the way Google actually reads local
businesses.

- **Technical framing:** Google Maps SEO website template for local artisans.
- **Marketing framing:** A website template designed to get local craftsmen
  into the Google Maps Local 3-Pack.

## Why this template, specifically

- **One config, one business** — `site.config.ts` holds everything (name,
  trade, city, services mapped to real Google Business Profile categories,
  reviews). Swap the file, get a new client's site.
- **Schema type matches the trade** — `Plumber`, `Electrician`, `Locksmith`,
  `HVACBusiness` in the JSON-LD, never a generic `LocalBusiness`.
- **Zero client-side JavaScript** — pure Server Component, prerendered as
  static HTML (`next build` reports `○ Static`). Nothing to hydrate, nothing
  to block the first paint on a mid-range phone on 4G — which matters
  directly for Core Web Vitals, one of Google's ranking signals.
- **NAP consistency built in** — the same name/address/phone appear in the
  header, the footer, and the JSON-LD, because inconsistent NAP is one of the
  most common reasons a listing underperforms locally.

## Where it lives

`/site-template` in this app — see the root [README](../../README.md) for
how to run the project. Reviews and business data here are the same demo
persona (Dupont Plomberie, Lyon) used across the rest of the MapArtisans
cahier des charges, for continuity.

## Not done here

This is the template only — no CMS, no way for an artisan to edit their own
copy without touching code, no deployment per client. That's backend work:
turning `site.config.ts` into rows read from the `companies` /
`google_profiles` tables (schema v1.3) and serving one route per client
domain.
