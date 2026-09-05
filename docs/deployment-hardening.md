# E-REPORTS Production Deployment Hardening

This checklist applies the pre-deployment controls reviewed from the supplied video.

## Security

- Supabase RLS remains the authoritative tenant boundary.
- State-changing API requests with an explicit Origin are restricted to configured application/deployment origins.
- No raw SQL is constructed from request input; Supabase query-builder parameters are used.
- API identifiers are UUID-shaped where they enter application query boundaries.
- No `dangerouslySetInnerHTML`, `innerHTML`, `eval`, or `new Function` usage exists in application code.
- Security headers remain configured in `next.config.ts`.

## Abuse protection

Authenticated API endpoints retain per-IP + user + route rate limiting. Supabase Auth hosted limits remain the authentication backstop. The in-memory limiter is defense-in-depth, not a distributed quota system.

## Performance

Production migrations add targeted indexes for marks, student rosters, exam scope relationships, and other foreign-key paths identified by the database performance advisor.

## Failure handling and monitoring

- Root, dashboard, Super Admin, and not-found error screens are present.
- `/api/health` returns 200 only when Supabase is reachable and 503 on failure.
- Structured JSON logs include request IDs and rate-limit events.
- Configure a production alert on `/api/health` returning 503 and elevated 5xx/fatal runtime errors.

## Recovery

Vercel deployments are immutable. Treat the new deployment as the candidate and keep the previous production deployment available for immediate rollback, providing a blue/green-style recovery path without destructive database changes.

## Pre-promotion checks

```text
npm ci
npm run typecheck
npm run lint
npm run build
```

Smoke-test `/login`, `/dashboard`, `/dashboard/marks`, `/dashboard/broadsheets`, `/dashboard/reports`, `/dashboard/analysis`, and `/api/health` before promotion.
