# Superseded by the unified Cadence app

This standalone app's functionality has been merged into `Cadence/web/src/fitness/`,
running inside the unified Cadence super-app on Cadence's own Supabase project
(schema `fitness`) instead of a separate project. See
`Cadence/AGENTS.md` → "The unified super app".

This directory is kept in place (not deleted) as a reference copy — it is
not built or deployed anymore once the unified app is live. No Fitness data
was ever live in this standalone project, so there is no data-migration step
for this one (unlike Financial). Once you've confirmed the unified app's
Fitness domain works the way you want, it's safe to delete this directory
and its standalone Supabase/Vercel projects (if you created them).
