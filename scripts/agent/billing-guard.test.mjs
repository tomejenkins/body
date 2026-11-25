import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCostsPage, readProjectCost, sumReservations, validateQueueBudget } from './billing-guard.mjs';

const projectId = 'proj_bodydemo';
const costPage = {
  object: 'page', has_more: false, next_page: null,
  data: [{object:'bucket',results:[{project_id: projectId,
    amount:{value:1.26,currency:'usd'}}]}],
};
test('reads project-attributed USD only', () => {
  assert.equal(parseCostsPage(costPage, projectId).amount,1.26);
  assert.throws(() => parseCostsPage({...costPage,data:[{object:'bucket',results:[
    {project_id:'proj_other',amount:{value:1,currency:'usd'}}]}]},projectId));
});
test('rejects missing/unknown spending and bad pagination', () => {
  assert.throws(()=>parseCostsPage({...costPage,data:[] ,has_more:true},projectId));
  assert.equal(validateQueueBudget({billing:null,reservationUsd:0,plannedUsd:1}).allowed,false);
});
test('fetches costs only from the official OpenAI URL with admin authentication',async()=>{
  let url;
  const result=await readProjectCost({adminKey:'sk-admin-test',projectId,
    now:Date.parse('2026-11-25T20:00:00Z'),
    fetchFn:async(u,options)=>{url=new URL(u);
      assert.equal(options.headers.Authorization,'Bearer sk-admin-test');
      return {ok:true,json:async()=>costPage};
    }});
  assert.equal(url.origin,'https://api.openai.com');
  assert.equal(url.pathname,'/v1/organization/costs');
  assert.equal(url.searchParams.get('project_ids'),projectId);
  assert.equal(result.recordedApiUsd,1.26);
  assert.equal(result.period,'2026-11');
});
test('ledger prevents duplicate plan and task reservations',()=>{
  const claim=(plan,issue)=>({user:{login:'github-actions[bot]'},
    body:'BODY-RESERVE v1 '+JSON.stringify({
      plan,digest:'a'.repeat(64),month:'2026-11',
      tasks:[{issue,cents:75}],
    })});
  const result=sumReservations([claim(100,101)],'2026-11');
  assert.equal(result.reservedApiUsd,.75);
  assert.equal(result.reservedPlans.has(100),true);
  assert.throws(()=>sumReservations([claim(100,101),claim(100,102)],'2026-11'));
  assert.throws(()=>sumReservations([claim(100,101),claim(102,101)],'2026-11'));
  assert.throws(()=>sumReservations([{...claim(100,101),user:{login:'attacker'}}],'2026-11'));
});
test('conservatively combines costs, reservations and estimated queue',()=>{
 const now=Date.now();
 const billing={recordedApiUsd:37.5,verifiedAt:now};
 assert.equal(validateQueueBudget({billing,reservationUsd:1,plannedUsd:2,now}).allowed,false);
 assert.equal(validateQueueBudget({billing:{recordedApiUsd:1.26,verifiedAt:now},
   reservationUsd:1,plannedUsd:1,now}).allowed,true);
});
