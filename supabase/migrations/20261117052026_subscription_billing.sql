-- Additive, dormant without server credentials. No trial/training policy changes.
-- A database belongs to one billing environment. Live requires a separately reviewed
-- operator change, in addition to server deployment approval. Never mix test and live.
create table body_private.billing_environment (
  singleton boolean primary key default true check(singleton),
  mode text not null check(mode in ('test','live'))
);
insert into body_private.billing_environment(mode) values('test');
alter table body_private.billing_environment enable row level security;
revoke all on body_private.billing_environment from public,anon,authenticated,service_role;
create table body_private.billing_accounts (
  owner_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check(mode in ('test','live')),
  customer_id text check(customer_id ~ '^cus_[A-Za-z0-9]+$'),
  customer_operation uuid not null default gen_random_uuid(),
  customer_started_at timestamptz,
  checkout_operation uuid not null default gen_random_uuid(),
  checkout_started_at timestamptz,
  checkout_plan text check(checkout_plan in ('monthly','annual')),
  checkout_id text check(checkout_id ~ '^cs_[A-Za-z0-9_]+$'),
  lease_token uuid, lease_until timestamptz,
  reconciled_at timestamptz,
  primary key(owner_id,mode), unique(mode,customer_id), unique(customer_operation), unique(checkout_operation)
);
create table body_private.billing_subscriptions (
  mode text not null, id text not null check(id ~ '^sub_[A-Za-z0-9]+$'),
  owner_id uuid not null, price text not null check(price ~ '^price_[A-Za-z0-9]+$'),
  plan text not null check(plan in ('monthly','annual')),
  status text not null check(status in ('active','past_due','unpaid','canceled','incomplete','incomplete_expired','trialing','paused')),
  period_start timestamptz not null, period_end timestamptz not null,
  cancel_at_end boolean not null, cancel_at timestamptz,
  reconciled_at timestamptz not null default clock_timestamp(),
  primary key(mode,id), foreign key(owner_id,mode) references body_private.billing_accounts(owner_id,mode) on delete cascade,
  check(isfinite(period_start) and isfinite(period_end) and period_end > period_start)
);
create index billing_subscriptions_owner on body_private.billing_subscriptions(owner_id,mode);
create table body_private.billing_periods (
  mode text not null, reference text not null, owner_id uuid not null,
  invoice text not null check(invoice ~ '^in_[A-Za-z0-9]+$'),
  primary key(mode,reference),
  foreign key(owner_id,mode) references body_private.billing_accounts(owner_id,mode) on delete cascade
);
create index billing_periods_owner on body_private.billing_periods(owner_id,mode);
alter table body_private.billing_periods enable row level security;
revoke all on body_private.billing_periods from public,anon,authenticated,service_role;
create table body_private.billing_events (
  mode text not null, id text not null check(id ~ '^evt_[A-Za-z0-9]+$'),
  owner_id uuid not null, type text not null check(length(type) between 1 and 100),
  object_id text not null check(length(object_id) between 1 and 255),
  received_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz, attempts integer not null default 1 check(attempts > 0),
  primary key(mode,id), foreign key(owner_id,mode) references body_private.billing_accounts(owner_id,mode) on delete cascade
);
create index billing_events_owner on body_private.billing_events(owner_id,mode);
alter table body_private.billing_accounts enable row level security;
alter table body_private.billing_subscriptions enable row level security;
alter table body_private.billing_events enable row level security;
revoke all on body_private.billing_accounts,body_private.billing_subscriptions,body_private.billing_events from public,anon,authenticated,service_role;

-- Only the trusted billing server may call these functions. No public grant-minting API.
create function public.billing_lookup_customer(p_customer text,p_mode text) returns uuid
language sql security definer set search_path = '' as $$
  select owner_id from body_private.billing_accounts where mode=p_mode and customer_id=p_customer
$$;
revoke all on function public.billing_lookup_customer(text,text) from public,anon,authenticated;
grant execute on function public.billing_lookup_customer(text,text) to service_role;

create function public.billing_claim(p_owner uuid,p_mode text,p_event jsonb default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a body_private.billing_accounts; t timestamptz; lifetime boolean;
begin
  if not exists(select 1 from body_private.billing_environment where mode=p_mode) or not exists(select 1 from auth.users where id=p_owner and email_confirmed_at is not null and not is_anonymous) then
    raise exception 'Ineligible billing identity' using errcode='42501';
  end if;
  insert into body_private.billing_accounts(owner_id,mode) values(p_owner,p_mode) on conflict do nothing;
  select * into strict a from body_private.billing_accounts where owner_id=p_owner and mode=p_mode for update;
  t:=clock_timestamp();
  if p_event is not null and exists(select 1 from body_private.billing_events where mode=p_mode and id=p_event->>'id' and (owner_id<>p_owner or type<>p_event->>'type' or object_id<>p_event->>'object')) then raise exception 'Event identity conflict' using errcode='23514'; end if;
  if p_event is not null and exists(select 1 from body_private.billing_events where mode=p_mode and id=p_event->>'id' and owner_id=p_owner and completed_at is not null) then
    return jsonb_build_object('duplicate',true);
  end if;
  if a.lease_until > t then raise exception 'Billing operation in progress' using errcode='55P03'; end if;
  update body_private.billing_accounts set lease_token=gen_random_uuid(),lease_until=t+interval '120 seconds'
    where owner_id=p_owner and mode=p_mode returning * into a;
  if p_event is not null then
    insert into body_private.billing_events(mode,id,owner_id,type,object_id)
      values(p_mode,p_event->>'id',p_owner,p_event->>'type',p_event->>'object')
      on conflict(mode,id) do update set attempts=body_private.billing_events.attempts+1
      where body_private.billing_events.owner_id=excluded.owner_id and body_private.billing_events.type=excluded.type and body_private.billing_events.object_id=excluded.object_id;
    if not found then raise exception 'Event identity conflict' using errcode='23514'; end if;
  end if;
  select exists(select 1 from body_private.access_grants where owner_id=p_owner and kind='lifetime'
    and body_private.grant_valid_at(valid_from,expires_at,revoked_at,t)) into lifetime;
  return to_jsonb(a)-'lease_until' || jsonb_build_object('has_lifetime',lifetime,'customer_retry_safe',a.customer_started_at is null or t < a.customer_started_at+interval '23 hours','checkout_retry_safe',a.checkout_started_at is null or t < a.checkout_started_at+interval '23 hours','refresh_allowed',a.reconciled_at is null or t >= a.reconciled_at+interval '3 seconds');
end $$;
revoke all on function public.billing_claim(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.billing_claim(uuid,text,jsonb) to service_role;

create function public.billing_commit(p_owner uuid,p_mode text,p_token uuid,p_change jsonb,p_event text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare a body_private.billing_accounts; item jsonb; t timestamptz; src text; ref text;
begin
  select * into strict a from body_private.billing_accounts where owner_id=p_owner and mode=p_mode for update;
  t:=clock_timestamp();
  if a.lease_token is distinct from p_token or a.lease_until <= t then raise exception 'Stale billing worker' using errcode='40001'; end if;
  if p_change->>'startCustomer'='true' then
    update body_private.billing_accounts set customer_started_at=coalesce(customer_started_at,t) where owner_id=p_owner and mode=p_mode;
  end if;
  if p_change ? 'customer' then
    if a.customer_id is not null and a.customer_id <> p_change->>'customer' then raise exception 'Customer identity conflict'; end if;
    update body_private.billing_accounts set customer_id=p_change->>'customer' where owner_id=p_owner and mode=p_mode;
  end if;
  if p_change ? 'plan' then
    if a.checkout_plan is not null and a.checkout_plan <> p_change->>'plan' then raise exception 'Checkout plan conflict'; end if;
    update body_private.billing_accounts set checkout_plan=p_change->>'plan',checkout_started_at=coalesce(checkout_started_at,t)
      where owner_id=p_owner and mode=p_mode;
  end if;
  if p_change ? 'checkout' then
    if a.checkout_id is not null and a.checkout_id <> p_change->>'checkout' then raise exception 'Checkout identity conflict'; end if;
    update body_private.billing_accounts set checkout_id=p_change->>'checkout' where owner_id=p_owner and mode=p_mode;
  end if;
  if p_change->>'resetCheckout'='true' then
    update body_private.billing_accounts set checkout_id=null,checkout_plan=null,checkout_started_at=null,checkout_operation=gen_random_uuid()
      where owner_id=p_owner and mode=p_mode;
  end if;
  if p_change ? 'subscriptions' then
    -- Preserve 7.7E's ordered grant locks. Never take session locks from billing.
    perform id from body_private.access_grants where owner_id=p_owner order by id for update;
    for item in select value from jsonb_array_elements(p_change->'subscriptions') loop
      insert into body_private.billing_subscriptions(mode,id,owner_id,price,plan,status,period_start,period_end,cancel_at_end,cancel_at)
      values(p_mode,item->>'id',p_owner,item->>'price',item->>'plan',item->>'status',(item->>'start')::timestamptz,(item->>'end')::timestamptz,(item->>'cancelAtEnd')::boolean,(item->>'cancelAt')::timestamptz)
      on conflict(mode,id) do update set price=excluded.price,plan=excluded.plan,status=excluded.status,period_start=excluded.period_start,
        period_end=excluded.period_end,cancel_at_end=excluded.cancel_at_end,cancel_at=excluded.cancel_at,reconciled_at=t
        where body_private.billing_subscriptions.owner_id=excluded.owner_id;
      if not found then raise exception 'Subscription identity conflict'; end if;
    end loop;
    src:='stripe:'||p_mode;
    -- A complete fresh snapshot must include every previously observed invoice period.
    -- Missing or now-unpaid evidence is revoked, never silently retained.
    update body_private.access_grants set revoked_at=coalesce(revoked_at,t)
      where owner_id=p_owner and kind='subscription' and source=src
      and not exists(select 1 from jsonb_array_elements(p_change->'periods') x where x->>'reference'=source_reference);
    for item in select value from jsonb_array_elements(p_change->'periods') loop
      ref:=item->>'reference';
      if ref !~ '^sub_[A-Za-z0-9]+/il_[A-Za-z0-9]+$' or not exists(
        select 1 from body_private.billing_subscriptions where mode=p_mode and owner_id=p_owner and id=split_part(ref,'/',1)) then raise exception 'Invalid paid source'; end if;
      insert into body_private.billing_periods(mode,reference,owner_id,invoice) values(p_mode,ref,p_owner,item->>'invoice')
        on conflict(mode,reference) do update set invoice=excluded.invoice
        where body_private.billing_periods.owner_id=p_owner and body_private.billing_periods.invoice=excluded.invoice;
      if not found then raise exception 'Immutable invoice source conflict'; end if;
      insert into body_private.access_grants(owner_id,kind,source,source_reference,valid_from,expires_at,revoked_at)
      values(p_owner,'subscription',src,ref,(item->>'start')::timestamptz,(item->>'end')::timestamptz,case when (item->>'revoked')::boolean then t end)
      on conflict(source,source_reference) do update set revoked_at=case when (item->>'revoked')::boolean then coalesce(body_private.access_grants.revoked_at,t) end
        where body_private.access_grants.owner_id=p_owner and body_private.access_grants.kind='subscription'
        and body_private.access_grants.valid_from=excluded.valid_from and body_private.access_grants.expires_at=excluded.expires_at;
      if not found then raise exception 'Immutable paid source conflict'; end if;
    end loop;
    update body_private.billing_accounts set reconciled_at=t where owner_id=p_owner and mode=p_mode;
  end if;
  if p_event is not null then
    if not(p_change ? 'subscriptions') then raise exception 'Event requires reconciliation'; end if;
    update body_private.billing_events set completed_at=t where mode=p_mode and owner_id=p_owner and id=p_event and completed_at is null;
    if not found then raise exception 'Missing event receipt'; end if;
  end if;
  if coalesce((p_change->>'release')::boolean,false) then
    update body_private.billing_accounts set lease_until=null,lease_token=null where owner_id=p_owner and mode=p_mode;
  end if;
end $$;
revoke all on function public.billing_commit(uuid,text,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.billing_commit(uuid,text,uuid,jsonb,text) to service_role;

create function public.billing_summary() returns jsonb
language sql security definer set search_path = '' as $$
  select jsonb_build_object('lifetime',exists(select 1 from body_private.access_grants where owner_id=auth.uid() and kind='lifetime'
    and body_private.grant_valid_at(valid_from,expires_at,revoked_at,clock_timestamp())),
    'subscriptions',coalesce((select jsonb_agg(jsonb_build_object('plan',s.plan,'status',s.status,'periodEnd',s.period_end,'cancelAtEnd',s.cancel_at_end,'mode',s.mode))
      from body_private.billing_subscriptions s where s.owner_id=auth.uid()),'[]'::jsonb),
    'hasCustomer',exists(select 1 from body_private.billing_accounts where owner_id=auth.uid() and customer_id is not null))
  where auth.uid() is not null
$$;
revoke all on function public.billing_summary() from public,anon,service_role;
grant execute on function public.billing_summary() to authenticated;
