# Secrets

## Rules

- Never commit `.env`, `.env.local`, or any file with a real credential.
  `.env.example` is the only environment file tracked in git, and it holds
  placeholders only.
- All environment variables are read through `src/lib/config/env.ts` — see
  that file for the validated list. Nothing else should call
  `process.env.*` directly.
- `SUPABASE_SERVICE_ROLE_KEY` and any other server-only secret must never
  be imported from a file that ships to the browser (no `NEXT_PUBLIC_`
  prefix, no client component import).
- Secrets for CI/deployment live in GitHub repository/environment secrets,
  never inline in workflow YAML.

## If a secret is accidentally committed

1. Stop — don't just delete the line in a follow-up commit and assume it's
   safe; it's already in git history.
2. Tell the founder immediately.
3. Remove the exposure from the repository (history rewrite if needed, with
   explicit approval — this repo treats history rewrites as a
   non-negotiable ask-first action).
4. Recommend credential rotation for the exposed secret.
5. Confirm rotation actually happened before considering it resolved.

## What must never reach source, docs, issues, PRs, commit messages, test

fixtures, screenshots, or logs

API keys (Anthropic, OpenAI, payment provider), the Supabase service-role
key, database passwords, OAuth client secrets, SMTP/WhatsApp credentials,
GitHub tokens, private SSH keys.
