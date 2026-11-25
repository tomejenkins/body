// Fail closed when patch overlaps an existing open PR; never merge automatically.
import { execFileSync } from 'node:child_process';
const run=(cmd,args)=>execFileSync(cmd,args,{encoding:'utf8',timeout:20000,maxBuffer:2_000_000});
const changed=run('git',['diff','--cached','--name-only','-z']).split('\0').filter(Boolean);
if(!changed.length||changed.length>10)throw Error('Expected 1–10 staged files');
const request=path=>JSON.parse(run('gh',['api','--method','GET',
  'repos/tomejenkins/body/'+path]));
for(let page=1;page<=10;page++){
  const pulls=request('pulls?state=open&per_page=100&page='+page);
  if(!Array.isArray(pulls))throw Error('GitHub PR list unavailable');
  for(const pr of pulls){
    const files=[];
    for(let part=1;part<=10;part++){
      const batch=request('pulls/'+pr.number+'/files?per_page=100&page='+part);
      if(!Array.isArray(batch))throw Error('GitHub changed-files list unavailable');
      files.push(...batch.map(f=>f.filename));
      if(batch.length<100)break;
      if(part===10)throw Error('Too many files in an open PR');
    }
    const overlap=changed.filter(path=>files.includes(path));
    if(overlap.length)throw Error('Patch overlaps open PR #'+pr.number+
      ': '+overlap.join(', '));
  }
  if(pulls.length<100)break;
  if(page===10)throw Error('Too many open PRs to safely compare');
}
console.log('No open PR modifies the candidate patch files');
