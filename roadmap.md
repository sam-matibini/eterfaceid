# eterfaceID roadmap

## Done
- Phase 1 — public marketing site
- Phase 2 — console: cases, alerts, audit trail, roles, API keys
- Phase 3a — in-house watchlist warehouse, ingestion, name-matching engine, case screening, list search

## In progress
- Phase 3b — document, selfie and liveness engine (MRZ parsing, document validation, capture quality, liveness challenge, encrypted 7-year storage)
- Phase 3c — own risk signals (device/network, email, phone) and combined explainable risk score

## Next
- Phase 3d — public REST API + webhooks for customers
- Phase 3e — optional add-ons when keys arrive: Plaid, Interac, Twilio/Telesign, IP/email reputation
- Load the remaining lists (US OFAC, EU, Canada SEMA, PEP sources) and schedule the nightly refresh

## Blocked / waiting on user
- Face-match model weights and vendor keys (Plaid, Interac, Twilio/Telesign, IP-risk) when available
- Replace placeholder marketing content (prices, address, team, certifications)
