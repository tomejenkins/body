"""Real independent DB connections, disposable isolated target only."""
import concurrent.futures
import json
import subprocess
import uuid

BASE = ["docker", "exec", "-i", "supabase_db_body", "psql", "-X", "-qAt", "-U", "postgres", "-d", "body_entitlement_isolated", "-v", "ON_ERROR_STOP=1"]
def sql(query, check=True):
    result = subprocess.run(BASE, input=query, text=True, capture_output=True)
    if check and result.returncode:
        raise AssertionError(result.stderr)
    return result

owner = str(uuid.uuid4())
sql(f"insert into auth.users(id,email_confirmed_at) values('{owner}',clock_timestamp());")
try:
    claim = f"set role service_role; select public.billing_claim('{owner}','test',null);"
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(lambda _: sql(claim, False), range(8)))
    winners = [r for r in results if r.returncode == 0]
    assert len(winners) == 1, [r.stderr for r in results]
    first = json.loads(winners[0].stdout)
    assert sql(f"select count(*) from body_private.billing_accounts where owner_id='{owner}';").stdout.strip() == '1'
    print('PASS: eight concurrent checkout/customer claims have one winner and one persistent operation identity')
    sql(f"update body_private.billing_accounts set lease_until=clock_timestamp()-interval '1 second' where owner_id='{owner}';")
    second = json.loads(sql(claim).stdout)
    assert first['customer_operation'] == second['customer_operation']
    assert first['checkout_operation'] == second['checkout_operation']
    assert first['lease_token'] != second['lease_token']
    print('PASS: retry after lost acknowledgement retains customer and Checkout idempotency keys')
    old_commit = sql(f"set role service_role; select public.billing_commit('{owner}','test','{first['lease_token']}','{{\"customer\":\"cus_stale\",\"release\":true}}',null);", False)
    assert old_commit.returncode != 0 and 'Stale billing worker' in old_commit.stderr
    sql(f"set role service_role; select public.billing_commit('{owner}','test','{second['lease_token']}','{{\"customer\":\"cus_current\",\"release\":true}}',null);")
    assert sql(f"select customer_id from body_private.billing_accounts where owner_id='{owner}';").stdout.strip() == 'cus_current'
    print('PASS: expired worker cannot overwrite current provider mapping after a newer claim')
finally:
    sql(f"delete from auth.users where id='{owner}';")
