-- 0002: enum extensions. Kept in its own migration because a newly added enum value
-- cannot be referenced until the transaction that added it has committed.
alter type public.app_role add value if not exists 'viewer';
alter type public.submission_status add value if not exists 'changes_requested';
alter type public.fixture_status add value if not exists 'half_time';
alter type public.fixture_status add value if not exists 'abandoned';
