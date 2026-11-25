// Trusted Body daily queue controller. No shell evaluation of issue text.
// Modes: reserve (GitHub issue-comment event), verify (before paid Codex),
// publish (recheck owner approval and reservation before publishing draft PR).
import { execFileSync } from 'node:child_process';
import { readFileSync, appendFileSync } from 'node:fs';
import { planDigest, parseDailyPlan, validateDailyApproval } from './daily-plan-policy.mjs';
import { readProjectCost, sumReservations, validateQueueBudget } from './billing-guard.mjs';

const REPO = 'tomejenkins/body';
const OWNER = 'tomejenkins';
const mode = process.argv[2];
if (!['reserve','verify','publish'].includes(mode)) throw Error('Unsupported queue mode');
if (process.env.GITHUB_REPOSITORY !== REPO ||
    process.env.GITHUB_REF !== 'refs/heads/main') throw Error('Queue must run on protected main');
const id = n => Number.isSafeInteger(n) && n > 0 && n < 100_000_000;
const planNumber = Number(process.env.PLAN_ISSUE_NUMBER);
const ledgerNumber = Number(process.env.BODY_AGENT_LEDGER_ISSUE);
const runId = String(process.env.GITHUB_RUN_ID ?? '');
if (!id(planNumber) || !id(ledgerNumber) || !/^[0-9]{6,}$/.test(runId)) {
  throw Error('Missing plan, ledger or run identity');
}
const gh = (args, json=true) => {
  const out = execFileSync('gh',args,{encoding:'utf8',timeout:20000,
    maxBuffer:2_000_000,stdio:['ignore','pipe','pipe']});
  return json ? JSON.parse(out) : out;
};
const api = endpoint => gh(['api','--method','GET','repos/'+REPO+'/'+endpoint]);
function pages(path) {
  const data=[];
  for(let page=1;page<=10;page++){
    const rows=api(path+(path.includes('?')?'&':'?')+'per_page=100&page='+page);
    if(!Array.isArray(rows))throw Error('Unexpected GitHub pagination');
    data.push(...rows);
    if(rows.length<100)return data;
  }
  throw Error('GitHub listing too large for a safe decision');
}
const localDate = () => {
  const f=new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',
    year:'numeric',month:'2-digit',day:'2-digit'});
  const m=Object.fromEntries(f.formatToParts(new Date())
    .filter(x=>['year','month','day'].includes(x.type)).map(x=>[x.type,x.value]));
  return m.year+'-'+m.month+'-'+m.day;
};
function openPrIssues(pulls) {
  const numbers=[];
  for(const p of pulls){
    const body=String(p.body??'');
    for(const m of body.matchAll(/(?:^|\n)Closes #([1-9][0-9]{0,7})(?=\s|$)/gm)){
      numbers.push(Number(m[1]));
    }
    const match=/^codex\/issue-([1-9][0-9]{0,7})-run-/.exec(p.head?.ref??'');
    if(match)numbers.push(Number(match[1]));
  }
  return numbers;
}
const planIssue=api('issues/'+planNumber);
const plan=parseDailyPlan(planIssue.body);
const digest=planDigest(planIssue.body);
const comments=pages('issues/'+planNumber+'/comments');
const taskIssues=[...plan.primary,...plan.alternatives].map(t=>api('issues/'+t.issue));
const pulls=pages('pulls?state=open');
const ledgerIssue=api('issues/'+ledgerNumber);
if(ledgerIssue.state!=='open'||ledgerIssue.pull_request||
   !(ledgerIssue.labels??[]).some(l=>l.name==='agent-ledger')) {
  throw Error('Dedicated open agent-ledger issue required');
}
const ledgerComments=pages('issues/'+ledgerNumber+'/comments');
const month=new Date().toISOString().slice(0,7);
const reservation=sumReservations(ledgerComments,month);
const taskNumber=Number(process.env.TASK_ISSUE_NUMBER);
const selectedEntry=n=>[...plan.primary,...plan.alternatives].find(t=>t.issue===n);
const expected=process.env.PLAN_SHA256;

if(mode==='reserve') {
  if(process.env.GITHUB_EVENT_NAME!=='issue_comment'||
     process.env.GITHUB_ACTOR!==OWNER)throw Error('Only owner comment event may reserve');
  const event=JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'));
  if(event.action!=='created'||event.issue?.number!==planNumber||
     event.comment?.user?.login!==OWNER||
     !String(event.comment?.body??'').startsWith('BODY-APPROVE v1 ')){
    throw Error('Invalid owner approval trigger');
  }
}
if(mode!=='reserve' && (!id(taskNumber)||!expected||expected!==digest)){
  throw Error('Task identity or approved plan digest mismatch');
}
if(reservation.reservedPlans.has(planNumber)&&mode==='reserve'){
  throw Error('Plan already reserved; no replay');
}

const plannedTasks=String((comments.filter(c=>c.user?.login===OWNER &&
  String(c.body??'').startsWith('BODY-APPROVE v1 ')))[0]?.body??'').trim()
  .match(/ issues=([1-9][0-9,]*)$/)?.[1]?.split(',').map(Number)??[];
const plannedUsd=plannedTasks.reduce((sum,n)=>sum+(selectedEntry(n)?.estimatedApiUsd??0),0);
const live=mode!=='publish'
  ? await readProjectCost({
      adminKey:process.env.BODY_OPENAI_ADMIN_KEY,
      projectId:process.env.BODY_OPENAI_PROJECT_ID,
    })
  : { recordedApiUsd:0,verifiedAt:Date.now() };
const currentReservation=mode==='reserve'?0:plannedUsd;
if(mode!=='reserve'){
  if(!reservation.reservedPlans.has(planNumber))throw Error('No ledger claim for plan');
  if(!plannedTasks.every(n=>reservation.reservedIssues.has(n))){
    throw Error('Approved task not covered by reservation');
  }
}
const pending=reservation.reservedApiUsd-currentReservation;
if(pending < -0.00001)throw Error('Reservation accounting underflow');
const approval=validateDailyApproval({
  planIssue, comments, taskIssues,
  openPrIssueNumbers: mode==='reserve' ? openPrIssues(pulls)
    : openPrIssues(pulls).filter(n=>n===taskNumber),
  today:localDate(),
  // In publishing (no paid work), only check the original owner's plan approval.
  // Spend verification always happens at reservation and immediately before Codex.
  spending:{recordedApiUsd:live.recordedApiUsd,pendingApiUsd:pending,
    verifiedAt:live.verifiedAt,now:Date.now()},
});
if(!approval.allowed)throw Error('Plan denied: '+approval.reason);
if(mode==='reserve'){
  if(approval.issues.some(n=>reservation.reservedIssues.has(n))){
    throw Error('A selected issue already has a monthly reservation');
  }
  const budget=validateQueueBudget({
    billing:live,reservationUsd:reservation.reservedApiUsd,
    plannedUsd:approval.estimatedApiUsd,
  });
  if(!budget.allowed)throw Error('Billing guard denied queue: '+budget.reason);
  const tasks=approval.issues.map(n=>({
    issue:n,hash:selectedEntry(n).taskSha256,
  }));
  const claim={plan:planNumber,digest,month,runId,tasks:tasks.map(t=>({
    issue:t.issue,cents:Math.ceil(selectedEntry(t.issue).estimatedApiUsd*100),
  }))};
  // This mutation executes under workflow-wide single-run concurrency.
  gh(['api','--method','POST','repos/'+REPO+'/issues/'+ledgerNumber+'/comments',
    '-f','body=BODY-RESERVE v1 '+JSON.stringify(claim)]);
  if(!process.env.GITHUB_OUTPUT)throw Error('Missing workflow output target');
  appendFileSync(process.env.GITHUB_OUTPUT,
    'matrix='+JSON.stringify({include:tasks})+'\n'+
    'plan_digest='+digest+'\n'+'plan_number='+planNumber+'\n');
  console.log('Reserved '+tasks.length+' tasks for approved plan #'+planNumber+
    '; no PRs or deployment authorized yet');
  process.exit(0);
}
if(!approval.issues.includes(taskNumber)||
   selectedEntry(taskNumber).taskSha256!==process.env.TASK_SHA256){
  throw Error('Task not approved or its exact body hash changed');
}
console.log(mode+' check passed for approved Body task #'+taskNumber);
