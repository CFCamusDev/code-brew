UPDATE site_settings
SET value = jsonb_set(value, '{tiktok}', '"https://www.tiktok.com/@coffecodebrew"'::jsonb), updated_at = now()
WHERE key = 'social_links'
AND value->>'tiktok' IN ('https://www.tiktok.com/@codebrew1', 'https://www.tiktok.com/@codebrew1/');
