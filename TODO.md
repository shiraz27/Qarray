# TODO - Complete-profile redirect fix

- [x] Inspect `src/pages/Index.tsx` redirect logic (done)
- [x] Remove duplicated profile/session fetch + redirect logic in `Index.tsx`
- [x] Add a loading/ready gate so we only redirect to `/complete-profile` after profile data is actually fetched

- [x] Ensure tutorial dialog logic still works once profile is loaded
- [x] Run `npm run build` (typecheck script not present)
- [ ] Smoke test: hard refresh + stale-session scenario


