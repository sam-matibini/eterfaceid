# eterfaceID roadmap

## Done
- Phase 1 — public marketing site
- Phase 2 — console: cases, alerts, audit trail, roles, API keys
- Phase 3a — in-house watchlist warehouse, ingestion, name-matching engine, case screening, list search
- Phase 3b — document engine (machine-readable zone reader with check digits, provincial number formats, expiry and cross-checks), liveness scoring, reviewer face-match decision
- Phase 3c — own risk signals (email, phone, device, network, velocity) with an explainable score
- Phase 3d — transaction monitoring with FINTRAC/FinCEN/FATF rules, beneficial-ownership calculation (25% UBO, OFAC 50% rule), address and age verification, regulatory report packages (STR/LCTR/EFTR/SAR/CTR/FIU), regulatory coverage page, public REST API v1 (cases, screening, transactions) and signed webhooks

## Next
- Phase 3e — optional add-ons when keys arrive: Plaid, Interac, Twilio/Telesign, IP/email reputation
- Nightly automatic list refresh (endpoint built at /api/public/hooks/refresh-watchlists; needs the schedule switched on after publish)
- Face-match model: currently a reviewer confirms the selfie against the document; automatic scoring needs model weights installed

## Blocked / waiting on user
- Vendor keys for the optional add-ons
- Replace placeholder marketing content (prices, address, team, certifications)
- Sign up with your own email so I can make you the administrator

## Accounts and teams (done)
- Companies (organizations), members with roles, email invites, onboarding screen.
- Every record is owned by a company; access rules and the public API are company-scoped.
- Invite emails are not sent automatically yet: the admin copies the invite link from Settings.
