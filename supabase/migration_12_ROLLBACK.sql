-- =====================================================================
-- ONLY RUN THIS IF SOMETHING WENT WRONG after migration 12 and you can't log in.
-- It puts the two logins back to the old Gmail addresses (same passwords)
-- and puts the admin flag back where the OLD app code looks for it.
-- The new security rules stay in place; admin keeps working through app_metadata.
-- After rolling back, also redeploy the previous version of the app code.
-- =====================================================================
begin;
update auth.users set email = 'liauchenhong20@gmail.com', phone = null where email = '601136308766@phone.lhg.invalid';
update auth.users set email = 'hingen.sdnbhd@gmail.com',  phone = null where email = '60146189180@phone.lhg.invalid';
update auth.identities set identity_data = jsonb_set(identity_data, '{email}', to_jsonb(u.email))
  from auth.users u
  where auth.identities.user_id = u.id and auth.identities.provider = 'email'
    and u.email in ('liauchenhong20@gmail.com', 'hingen.sdnbhd@gmail.com');
update auth.users set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || '{"role": "admin"}'::jsonb
  where email in ('liauchenhong20@gmail.com', 'hingen.sdnbhd@gmail.com');
commit;
