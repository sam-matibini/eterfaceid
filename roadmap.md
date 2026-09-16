# eterfaceID roadmap

## Done
- Phase 1 — public marketing site
- Phase 2 — console: cases, alerts, audit trail, roles, API keys
- Phase 3a — in-house watchlist warehouse, ingestion, name-matching engine, case screening, list search
- Phase 3b — document engine (machine-readable zone reader with check digits, provincial number formats, expiry and cross-checks), liveness scoring, reviewer face-match decision
- Phase 3c — own risk signals (email, phone, device, network, velocity) with an explainable score

## Next
- Phase 3d — public REST API + webhooks for customers
- Phase 3e — optional add-ons when keys arrive: Plaid, Interac, Twilio/Telesign, IP/email reputation
- Nightly automatic list refresh (endpoint built at /api/public/hooks/refresh-watchlists; needs the schedule switched on after publish)
- Face-match model: currently a reviewer confirms the selfie against the document; automatic scoring needs model weights installed

## Blocked / waiting on user
- Vendor keys for the optional add-ons
- Replace placeholder marketing content (prices, address, team, certifications)
- Sign up with your own email so I can make you the administrator
