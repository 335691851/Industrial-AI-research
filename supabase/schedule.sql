-- Optional minute-precision scheduler, useful with Vercel Hobby.
-- First enable pg_cron + pg_net in Supabase, then add two Vault secrets in the dashboard:
--   research_app_url = https://your-production-domain (no trailing slash)
--   research_cron_secret = same value as Vercel CRON_SECRET
-- Run as the database owner. No plaintext secrets are embedded in the cron command.
-- The app deduplicates daily runs if Vercel Cron is also enabled.
select cron.schedule(
  'chicheng-daily-research',
  '0 11 * * *',
  $$
    select net.http_get(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'research_app_url') || '/api/cron',
      headers := jsonb_build_object('Authorization', 'Bearer ' ||
        (select decrypted_secret from vault.decrypted_secrets where name = 'research_cron_secret')),
      timeout_milliseconds := 300000
    );
  $$
);
