# Social media pack — X (Twitter)

| File | Contents |
|------|----------|
| [X-PROFILE.md](./X-PROFILE.md) | Enterprise bio, link, pinned post |
| [POSTS-OVERALL.md](./POSTS-OVERALL.md) | 10 suite-level posts + schedule |
| [POSTS-ENDPOINTS.md](./POSTS-ENDPOINTS.md) | 31 individual endpoint posts |

## Images

- **Overall banners:** `public/social/overall/*.png`
- **Per-endpoint cards:** `public/social/cards/*.svg` (1200×675)

Regenerate endpoint cards:

```bash
node scripts/generate-social-cards.mjs
node scripts/generate-social-posts-md.mjs
```

## Quick start

1. Paste bio from `X-PROFILE.md` into your X profile.
2. Pin Post 1 from `POSTS-OVERALL.md`.
3. Attach matching image from `public/social/` when posting.
