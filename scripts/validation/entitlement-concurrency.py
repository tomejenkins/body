"""Disposable isolated PostgreSQL concurrency checks; no hosted target or credentials."""
import concurrent.futures
import subprocess
import uuid

DATABASE = "body_entitlement_isolated"
BASE = ["docker", "exec", "-i", "supabase_db_body", "psql", "-X", "-qAt", "-U", "postgres", "-d", DATABASE, "-v", "ON_ERROR_STOP=1"]


def sql(query, check=True):
    result = subprocess.run(BASE, input=query, text=True, capture_output=True)
    if check and result.returncode:
        raise AssertionError(result.stderr)
    return result


owner = str(uuid.uuid4())
identity = f"set role authenticated; set request.jwt.claims='{{\"sub\":\"{owner}\",\"role\":\"authenticated\"}}';"
sql(f"insert into auth.users(id,email_confirmed_at) values('{owner}',clock_timestamp()); insert into public.profiles(id,display_name) values('{owner}','Concurrency fixture'); insert into public.account_preferences(owner_id) values('{owner}');")
try:
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        activations = list(pool.map(lambda _: sql(identity + "select public.activate_account_trial(); select public.account_access()->>'trialExpiresAt';").stdout.strip(), range(8)))
    assert len(set(activations)) == 1, activations
    assert sql(f"select count(*) from body_private.account_trials where owner_id='{owner}'; select count(*) from body_private.access_grants where owner_id='{owner}';").stdout.strip() == '1\n1'
    print('PASS: eight concurrent activations share one trial/grant and exact expiration')
    session = sql(identity + 'select public.start_ad_hoc_workout();').stdout.strip()
    selection = sql(identity + f"select public.edit_workout('{session}','add',(select id from public.exercises where slug='barbell_bench_press'));").stdout.strip()
    set_id = sql(identity + f"select id from public.workout_sets where workout_exercise_id='{selection}' order by position limit 1;").stdout.strip()
    def save_set(reps):
        mutation = str(uuid.uuid4())
        command = identity + f"select * from public.log_workout_set('{selection}','{set_id}','save',0,'{mutation}',{reps},60,'working','external',true);"
        return sql(command, False), command
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        set_results = list(pool.map(save_set, [8, 9]))
    assert sum(r.returncode == 0 for r, _ in set_results) == 1, [r.stderr for r, _ in set_results]
    committed_set_command = next(command for result, command in set_results if result.returncode == 0)
    assert sql(f"select count(*) from public.workout_set_receipts where workout_exercise_id='{selection}';").stdout.strip() == '1'
    print('PASS: two-device same-revision set race commits exactly one save and payload receipt')
    item = str(uuid.uuid4())
    request = str(uuid.uuid4())
    sql(identity + f"select public.record_workout_cardio('{session}','{item}','add',0,'bike',null,'{request}');")
    def save(seconds):
        return sql(identity + f"select public.record_workout_cardio('{session}','{item}','save',1,'bike',{seconds},'{uuid.uuid4()}');", False)
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(save, [600, 700]))
    assert sum(r.returncode == 0 for r in results) == 1, [r.stderr for r in results]
    assert sql(f"select count(*) from public.workout_cardio_commands where owner_id='{owner}';").stdout.strip() == '2'
    print('PASS: two-device same-revision cardio race commits exactly one save')
    # Authoritative protected fixture expiration retains only fixed-session grace.
    sql(f"update body_private.access_grants set valid_from=clock_timestamp()-interval '15 days',expires_at=clock_timestamp()-interval '1 minute' where owner_id='{owner}'; update public.workout_sessions set access_authorized_at=clock_timestamp()-interval '2 minutes',access_continuation_until=clock_timestamp()+interval '3 hours' where id='{session}';")
    revoker = subprocess.Popen(BASE, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, bufsize=1)
    assert revoker.stdin and revoker.stdout
    revoker.stdin.write(f"begin; update body_private.access_grants set revoked_at=clock_timestamp() where owner_id='{owner}'; select 'revocation_locked';\n")
    revoker.stdin.flush()
    assert revoker.stdout.readline().strip() == 'revocation_locked'
    command = identity + f"select public.record_workout_cardio('{session}','{item}','save',2,'bike',800,'{uuid.uuid4()}');"
    waiter = subprocess.Popen(BASE, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    assert waiter.stdin
    waiter.stdin.write(command)
    waiter.stdin.close()
    blocked = False
    for _ in range(100):
        if sql("select exists(select 1 from pg_stat_activity where datname=current_database() and cardinality(pg_blocking_pids(pid))>0);").stdout.strip() == 't':
            blocked = True
            break
    assert blocked, 'save did not serialize behind grant revocation'
    # Insert after the waiting authorization's lock scan began. It must not be
    # selected unlocked by the later READ COMMITTED eligibility query.
    sql(f"insert into body_private.access_grants(owner_id,kind,source,source_reference,valid_from) values('{owner}','lifetime','concurrency-fixture','{owner}',clock_timestamp());")
    revoker.stdin.write('commit;\n')
    revoker.stdin.close()
    assert revoker.wait(timeout=20) == 0
    assert waiter.wait(timeout=20) != 0
    assert waiter.stderr and 'Training access required' in waiter.stderr.read()
    print('PASS: revocation precedes acceptance; concurrent unlocked new grant cannot authorize waiting save')
    sql(identity + f"select public.record_workout_cardio('{session}','{item}','save',2,'bike',900,'{uuid.uuid4()}');")
    print('PASS: new grant is considered safely on the next command')
    sql(f"update body_private.access_grants set revoked_at=clock_timestamp() where owner_id='{owner}' and source='concurrency-fixture';")
    # Previously committed identical receipt still recovers despite revocation.
    sql(identity + f"select public.record_workout_cardio('{session}','{item}','add',0,'bike',null,'{request}');")
    changed = sql(identity + f"select public.record_workout_cardio('{session}','{item}','add',0,'treadmill',null,'{request}');", False)
    assert changed.returncode != 0
    sql(committed_set_command)
    print('PASS: lost-ack set/cardio receipts recover after revocation; changed payload denied')
finally:
    sql(f"delete from auth.users where id='{owner}';")
