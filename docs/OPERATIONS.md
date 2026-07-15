# Operations Runbook

## Health check

`GET /api/health` is safe for uptime monitoring. It returns only boolean integration
configuration states, the database state, and the number of queued retry jobs. A 503
response means the database cannot be reached.

## OTP delivery

Production OTP delivery is deliberately fail-closed. Configure the Naver Cloud SENS
provider before setting `OTP_DEV_BYPASS=0` in production:

```text
SMS_PROVIDER=naver-sens
NAVER_SENS_ACCESS_KEY=...
NAVER_SENS_SECRET_KEY=...
NAVER_SENS_SERVICE_ID=...
NAVER_SENS_SENDER=01012345678
```

## Review proof retry worker

When OCR is temporarily unavailable, the proof image is stored first and an
`OperationalJob` is queued. Call the endpoint from a secure scheduler once per minute:

```text
POST https://<deployment>/api/internal/jobs/process
Authorization: Bearer <CRON_SECRET>
Content-Type: application/json

{"limit":10}
```

The worker uses exponential backoff and stops after four attempts. A failed job leaves
the reviewer submission in manual-review state so no point is awarded accidentally.

## Database schema deployment

After deploying this version, apply the PostgreSQL schema before enabling shared rate
limits and retry processing:

```powershell
npm run db:push:pg
```

Run the command with the production `DATABASE_URL` and `DB_PROVIDER=postgres` in the
environment. The change adds `RateLimitBucket`, `OperationalJob`, and receipt indexes.
