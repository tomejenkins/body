begin;
-- Private provenance is available only to identity-bound functions, never the API.
create table body_private.account_trials (
 owner_id uuid primary key references auth.users(id) on delete cascade,
 activated_at timestamptz not null,
 expires_at timestamptz not null,
 policy_version text not null check(policy_version='14d-v1'),
 provenance text not null check(provenance='verified_activation'),
 created_at timestamptz not null default clock_timestamp(),
 check(isfinite(activated_at) and isfinite(expires_at) and expires_at=activated_at+interval '336 hours')
);
create table body_private.access_grants (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 kind text not null check(kind in('trial','subscription','promotion','lifetime')),
 source text not null check(length(source) between 1 and 100),
 source_reference text not null check(length(source_reference) between 1 and 300),
 valid_from timestamptz not null, expires_at timestamptz, revoked_at timestamptz,
 created_at timestamptz not null default clock_timestamp(),
 check(isfinite(valid_from) and (expires_at is null or isfinite(expires_at) and expires_at>valid_from)),
 check((kind='lifetime' and expires_at is null) or (kind<>'lifetime' and expires_at is not null)),
 unique(source,source_reference), unique(id,owner_id)
);
create unique index one_account_trial_grant on body_private.access_grants(owner_id) where kind='trial';
create index account_grant_lock_order on body_private.access_grants(owner_id,id);
create index current_account_grants on body_private.access_grants(owner_id,valid_from,expires_at) where revoked_at is null;
alter table body_private.account_trials enable row level security;
alter table body_private.access_grants enable row level security;
revoke all on body_private.account_trials,body_private.access_grants from public,anon,authenticated,service_role;
create function body_private.grant_valid_at(p_from timestamptz,p_until timestamptz,p_revoked timestamptz,p_instant timestamptz)
returns boolean language sql immutable security invoker set search_path='' as $$
 select p_revoked is null and p_from<=p_instant and (p_until is null or p_instant<p_until)
$$;
revoke all on function body_private.grant_valid_at(timestamptz,timestamptz,timestamptz,timestamptz) from public,anon,authenticated,service_role;
-- No table access policies: summaries deliberately omit all internal provenance.
create function public.activate_account_trial() returns void language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); instant timestamptz; t body_private.account_trials;
begin
 if uid is null or not exists(select 1 from auth.users where id=uid and email_confirmed_at is not null and not coalesce(is_anonymous,false)) then
  raise exception 'Verified account required' using errcode='42501';
 end if;
 if exists(select 1 from body_private.account_trials where owner_id=uid) then return;end if;
 -- One account lock also makes absent-row initialization atomic across devices.
 perform 1 from auth.users where id=uid for update;
 if exists(select 1 from body_private.account_trials where owner_id=uid) then return;end if;
 instant:=clock_timestamp();
 insert into body_private.account_trials(owner_id,activated_at,expires_at,policy_version,provenance)
 values(uid,instant,instant+interval '336 hours','14d-v1','verified_activation') returning * into t;
 insert into body_private.access_grants(owner_id,kind,source,source_reference,valid_from,expires_at)
 values(uid,'trial','trial:14d-v1',uid::text,t.activated_at,t.expires_at);
end $$;
revoke all on function public.activate_account_trial() from public,anon,authenticated,service_role;
grant execute on function public.activate_account_trial() to authenticated;

-- The database owns these fields. Existing sessions deliberately remain unstamped.
alter table public.workout_sessions
 add column access_grant_id uuid,
 add column access_authorized_at timestamptz,
 add column access_continuation_until timestamptz,
 add foreign key(access_grant_id,owner_id) references body_private.access_grants(id,owner_id),
 add check((access_grant_id is null)=(access_authorized_at is null));

create function public.account_access(p_session uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); instant timestamptz:=clock_timestamp(); g body_private.access_grants;t body_private.account_trials;w public.workout_sessions;continuing boolean:=false;
begin
 if uid is null or not exists(select 1 from auth.users where id=uid and email_confirmed_at is not null and not coalesce(is_anonymous,false)) then raise exception 'Verified account required' using errcode='42501';end if;
 select * into t from body_private.account_trials where owner_id=uid;
 select * into g from body_private.access_grants where owner_id=uid and revoked_at is null and body_private.grant_valid_at(valid_from,expires_at,revoked_at,instant)
 order by expires_at desc nulls first,valid_from,id limit 1;
 if p_session is not null then
  select * into w from public.workout_sessions where id=p_session and owner_id=uid;
  if w.id is null then raise exception 'Workout unavailable' using errcode='42501';end if;
  continuing:=w.status='in_progress' and w.archived_at is null and w.last_activity_at is not null
   and instant<w.last_activity_at+interval '12 hours' and instant<w.access_continuation_until
   and exists(select 1 from body_private.access_grants x where x.id=w.access_grant_id and x.owner_id=uid and x.revoked_at is null and x.valid_from<=w.access_authorized_at and w.access_authorized_at<x.expires_at);
 end if;
 return jsonb_build_object('allowed',g.id is not null,'source',coalesce(g.kind,'none'),'expiresAt',g.expires_at,
 'trialActivatedAt',t.activated_at,'trialExpiresAt',t.expires_at,
 'state',case when g.id is not null then case when g.kind='trial' then 'trial' else 'active' end when t.owner_id is null then 'uninitialized' else 'expired' end,
 'continuationAllowed',coalesce(continuing,false),'continuationUntil',w.access_continuation_until,'checkedAt',instant);
end $$;
revoke all on function public.account_access(uuid) from public,anon,authenticated,service_role;
grant execute on function public.account_access(uuid) to authenticated;
commit;
