import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync,execFileSync} from 'node:child_process';
const scripts=path.resolve('scripts');
function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'xbaer-production-'));
 const git=(...a)=>execFileSync('git',a,{cwd:root}).toString().trim();
 fs.mkdirSync(path.join(root,'scripts'));for(const n of ['production.mjs','deploy-production.sh','rollback-production.sh'])fs.copyFileSync(path.join(scripts,n),path.join(root,'scripts',n));
 fs.mkdirSync(path.join(root,'src'));fs.writeFileSync(path.join(root,'src/main.ts'),'// fixture');
 fs.writeFileSync(path.join(root,'package.json'),'{"name":"xbaer-view"}');fs.writeFileSync(path.join(root,'package-lock.json'),'{}');
 fs.writeFileSync(path.join(root,'.gitignore'),'/dist\ndeploy/\nconfig/deployment.linux.json\n.production/\n.production-link\n');
 git('init','-q');git('config','user.name','Test');git('config','user.email','test@example.invalid');git('add','.');git('commit','-qm','A');const a=git('rev-parse','HEAD');
 fs.writeFileSync(path.join(root,'src/main.ts'),'// B');git('add','.');git('commit','-qm','B');const b=git('rev-parse','HEAD');
 const config={members:{someone:{catalogUrl:'/member/catalog.json'}},basemapRoot:'/basemap/'};
 for(const d of ['deploy','dist','config'])fs.mkdirSync(path.join(root,d));
 fs.writeFileSync(path.join(root,'deploy/config.json'),JSON.stringify(config));fs.writeFileSync(path.join(root,'config/deployment.linux.json'),'server secret');
 fs.writeFileSync(path.join(root,'dist/config.json'),JSON.stringify(config));fs.writeFileSync(path.join(root,'dist/index.html'),'A');
 const bin=fs.mkdtempSync(path.join(os.tmpdir(),'xbaer-npm-'));
 fs.writeFileSync(path.join(bin,'npm'),`#!/bin/sh
if [ "$FAIL_NPM" = "$1" ]; then exit 42; fi
if [ "$1" = run ]; then mkdir -p dist/assets; printf B > dist/index.html; printf js > dist/assets/app.js; fi
`,{mode:0o755});
 const call=(action,args=[],env={})=>spawnSync('bash',[path.join(scripts,action+'-production.sh'),...args],{cwd:root,env:{...process.env,PATH:bin+path.delimiter+process.env.PATH,...env},encoding:'utf8'});
 return {root,git,a,b,call,config,cleanup:()=>{fs.rmSync(root,{recursive:true,force:true});fs.rmSync(bin,{recursive:true,force:true});}};
}
test('deploy, failed rebuild, rollback source and server config',()=>{
 const f=fixture();try{
  assert.equal(f.call('deploy',['--check']).status,0);
  let p=f.call('deploy',['--adopt-current',f.a]);assert.equal(p.status,0,p.stderr);
  const state=()=>JSON.parse(fs.readFileSync(path.join(f.root,'.production/state.json')));
  assert.equal(state().current.commit,f.b);assert.equal(state().previous.commit,f.a);
  assert.equal(fs.readFileSync(path.join(f.root,'dist/index.html'),'utf8'),'B');
  const before=JSON.stringify(state());
  for(const fail of ['ci','run']){p=f.call('deploy',[],{FAIL_NPM:fail});assert.notEqual(p.status,0);assert.equal(JSON.stringify(state()),before);assert.equal(fs.readFileSync(path.join(f.root,'dist/index.html'),'utf8'),'B');assert.equal(f.git('rev-parse','HEAD'),f.b);}
  f.config.basemapRoot='/new-basemap/';fs.writeFileSync(path.join(f.root,'deploy/config.json'),JSON.stringify(f.config));
  p=f.call('rollback');assert.equal(p.status,0,p.stderr);assert.equal(f.git('rev-parse','HEAD'),f.a);assert.equal(fs.readFileSync(path.join(f.root,'dist/index.html'),'utf8'),'A');assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.root,'dist/config.json'))),f.config);assert.equal(fs.readFileSync(path.join(f.root,'config/deployment.linux.json'),'utf8'),'server secret');
 }finally{f.cleanup();}
});
test('preflight failures leave running directory intact',()=>{
 const f=fixture();try{
  assert.notEqual(f.call('deploy',['--bad']).status,0);
  assert.notEqual(f.call('deploy').status,0);
  assert.notEqual(f.call('rollback').status,0);
  fs.writeFileSync(path.join(f.root,'src/main.ts'),'dirty');assert.notEqual(f.call('deploy',['--check']).status,0);f.git('restore','src/main.ts');
  fs.unlinkSync(path.join(f.root,'deploy/config.json'));assert.notEqual(f.call('deploy',['--check']).status,0);
  assert.equal(fs.readFileSync(path.join(f.root,'dist/index.html'),'utf8'),'A');assert.equal(f.git('rev-parse','HEAD'),f.b);
 }finally{f.cleanup();}
});
test('tampered previous release refuses rollback before checkout',()=>{
 const f=fixture();try{
  assert.equal(f.call('deploy',['--adopt-current',f.a]).status,0);
  const state=JSON.parse(fs.readFileSync(path.join(f.root,'.production/state.json')));
  fs.writeFileSync(path.join(f.root,'.production/releases',state.previous.id,'index.html'),'tampered');
  assert.notEqual(f.call('rollback').status,0);assert.equal(f.git('rev-parse','HEAD'),f.b);assert.equal(fs.readFileSync(path.join(f.root,'dist/index.html'),'utf8'),'B');
 }finally{f.cleanup();}
});
test('journal recovery restores serving release and source; lock blocks concurrent runs',()=>{
 const f=fixture();try{
  assert.equal(f.call('deploy',['--adopt-current',f.a]).status,0);
  const state=JSON.parse(fs.readFileSync(path.join(f.root,'.production/state.json')));
  const branch=f.git('symbolic-ref','--short','HEAD');
  fs.writeFileSync(path.join(f.root,'.production/journal.json'),JSON.stringify({before:state,sourceCommit:f.b,sourceBranch:branch,directoryBackup:null}));
  f.git('switch','--detach',f.a);
  fs.unlinkSync(path.join(f.root,'dist'));fs.symlinkSync('.production/releases/'+state.previous.id,path.join(f.root,'dist'));
  assert.notEqual(f.call('deploy').status,0);
  const p=f.call('deploy',['--recover']);assert.equal(p.status,0,p.stderr);assert.equal(f.git('rev-parse','HEAD'),f.b);assert.equal(f.git('symbolic-ref','--short','HEAD'),branch);assert.equal(fs.readFileSync(path.join(f.root,'dist/index.html'),'utf8'),'B');
  fs.mkdirSync(path.join(f.root,'.production/lock'));assert.notEqual(f.call('deploy').status,0);assert.ok(fs.existsSync(path.join(f.root,'.production/lock')));
 }finally{f.cleanup();}
});
test('tracked server configuration is rejected',()=>{
 const f=fixture();try{
  f.git('add','-f','deploy/config.json');f.git('commit','-qm','unsafe target');
  assert.notEqual(f.call('deploy',['--adopt-current',f.a]).status,0);
  assert.equal(fs.readFileSync(path.join(f.root,'dist/index.html'),'utf8'),'A');
 }finally{f.cleanup();}
});

test('rollback to pre-workflow commit keeps persistent management available',()=>{
 const f=fixture();try{
  f.git('switch','--detach',f.a);
  for(const name of ['production.mjs','deploy-production.sh','rollback-production.sh'])fs.unlinkSync(path.join(f.root,'scripts',name));
  fs.writeFileSync(path.join(f.root,'.gitignore'),'dist/\ndeploy/\nconfig/deployment.linux.json\n');
  f.git('add','-A');f.git('commit','-qm','legacy baseline');const legacy=f.git('rev-parse','HEAD');f.git('switch','--detach',f.b);
  assert.equal(f.call('deploy',['--adopt-current',legacy]).status,0);
  const result=f.call('rollback');assert.equal(result.status,0,result.stderr);assert.equal(f.git('rev-parse','HEAD'),legacy);
  assert.equal(f.git('status','--porcelain'),'');
  const p=spawnSync('bash',['.production/deploy-production.sh','--check'],{cwd:f.root,encoding:'utf8'});assert.equal(p.status,0,p.stderr);
 }finally{f.cleanup();}
});
