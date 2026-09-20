# Admin access code for the App admin area

A second lock on `/admin`: after signing in with your account, you also have to enter a secret access code. Everything inside — company records, billing, plans, the Resend/email integration settings and email log — stays sealed until the code is entered.

## How it will work

1. You open `/admin` while signed in as staff.
2. If the code hasn't been entered on this device in the last 7 days, an unlock screen appears: one field, "Enter access code".
3. Correct code → the admin area opens and stays unlocked on that device for 7 days.
4. Wrong code → a plain "Incorrect code" message, no hints, and repeated wrong attempts are slowed down.
5. A "Lock admin" button in the admin header ends the unlock immediately.
6. Signing out also ends it.

## The code itself

I generate a strong random code and store it in the encrypted secret store. It is never shown in the app or in chat, so you retrieve it once from Project Settings → Secrets (`ADMIN_ACCESS_CODE`) and keep it in your password manager. When you want it changed later, say so and I'll rotate it.

## Resend

Nothing changes about how email works — eterfaceID.com stays verified and emails keep sending from support@eterfaceID.com. The Integrations page (Resend status, on/off, test send) and the email log simply sit behind the new code along with the rest of the admin area.

## Technical notes

- Two generated secrets: `ADMIN_ACCESS_CODE` (32 chars) and `ADMIN_SESSION_SECRET` (64 chars, encrypts the unlock cookie).
- `src/lib/admin-gate.functions.ts`:
  - `unlockAdmin` — `createServerFn` + `requireSupabaseAuth`, re-checks `platform_staff`, compares the submitted code to `process.env.ADMIN_ACCESS_CODE` with a SHA-256 + `timingSafeEqual` check (never `===`), then `useSession({ name: "eid-admin", maxAge: 7 days, httpOnly, secure, sameSite lax })` set to `{ unlocked: true, userId }`.
  - `adminGateStatus` — returns whether the current session cookie is unlocked and belongs to the same user.
  - `lockAdmin` — clears the session.
  - Failed attempts recorded in `audit_events` (`admin.unlock.failed` / `admin.unlock`); more than 5 failures in 10 minutes for a user returns a "try again later" result.
- The code is never sent to the browser; only the boolean result crosses the boundary.
- `AdminShell` gains a gate step: staff check (existing) → `adminGateStatus` query → render `AdminUnlock` form instead of children when locked, plus a "Lock admin" button beside Sign out. All nine `/admin/*` routes render through `AdminShell`, so they are covered by the single change.
- Server-side defence in depth: `requireStaff` in `src/lib/platform.functions.ts` (and the same helper in `go-live.functions.ts`) additionally verifies the unlock cookie, so the admin RPC endpoints refuse calls made without an unlocked session — the UI gate is never the only check.
- No database migration needed.
