import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
const project=process.cwd();
function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'xbaer-push-test-'));
 const git=(...args)=>execFileSync('git',args,{cwd:root,stdio:['ignore','pipe','pipe']}).toString().trim();
 fs.mkdirSync(path.join(root,'scripts'));fs.mkdirSync(path.join(root,'node_modules/.bin'),{recursive:true});
 for(const f of ['push-production.sh','receive-production.sh'])fs.copyFileSync(path.join(project,'scripts',f),path.join(root,'scripts',f));
 fs.writeFileSync(path.join(root,'package.json'),'{"name":"xbaer-view"}');
 fs.writeFileSync(path.join(root,'.gitignore'),'/dist\n/deploy\n/.production\n/node_modules\n/config/deployment.linux.json\n');
 fs.writeFileSync(path.join(root,'scripts/deploy-production.sh'),`#!/bin/bash
set -eu
[[ "$CONDA_DEFAULT_ENV" == xbaer-web ]]
if [[ "\${1:-}" == --check ]]; then exit 0; fi
if [[ -f .production/fail-build ]]; then exit 42; fi
node -e 'const fs=require("fs"),cp=require("child_process");const p=".production/state.json",s=JSON.parse(fs.readFileSync(p));s.previous=s.current;s.current={commit:cp.execFileSync("git",["rev-parse","HEAD"]).toString().trim()};fs.writeFileSync(p,JSON.stringify(s))'
cp deploy/config.json dist/config.json
`);
 git('init','-q');git('config','user.name','Test');git('config','user.email','test@example.invalid');git('add','.');git('commit','-qm','fixture');const sha=git('rev-parse','HEAD');
 const aux=fs.mkdtempSync(path.join(os.tmpdir(),'xbaer-transport-test-'));const bin=path.join(aux,'bin');fs.mkdirSync(bin);
 function executable(p,s){fs.writeFileSync(p,s,{mode:0o755});}
 executable(path.join(bin,'npm'),'#!/bin/sh\nexit "${FAIL_TEST:-0}"\n');
 executable(path.join(root,'node_modules/.bin/vue-tsc'),'#!/bin/sh\nexit 0\n');
 executable(path.join(bin,'ssh'),'#!/bin/sh\necho unexpected-ssh >&2\nexit 99\n');
 executable(path.join(bin,'curl'),`#!/bin/bash
set -eu
out=''
while [[ $# -gt 0 ]]; do if [[ $1 == -o ]]; then out=$2; shift 2; else url=$1; shift; fi; done
if [[ $url == */config.json ]]; then cp dist/config.json "$out"; else cp dist/index.html "$out"; fi
if [[ -f .production/fail-http ]]; then printf 503; else printf 200; fi
`);
 fs.writeFileSync(path.join(aux,'conda.sh'),'conda() { [[ "$1" == activate ]]; export CONDA_DEFAULT_ENV="$2"; }\n');
 for(const dir of ['deploy','dist','.production'])fs.mkdirSync(path.join(root,dir));
 fs.writeFileSync(path.join(root,'deploy/config.json'),'{"server":true}');fs.writeFileSync(path.join(root,'dist/config.json'),'{"server":true}');fs.writeFileSync(path.join(root,'dist/index.html'),'working');fs.writeFileSync(path.join(root,'.production/state.json'),JSON.stringify({current:{commit:sha},previous:{commit:sha}}));
 const bundle=path.join(aux,'update');git('bundle','create',bundle,'HEAD');
 const run=(script,args=[],env={})=>spawnSync('bash',[path.join(root,'scripts',script),...args],{cwd:root,encoding:'utf8',env:{...process.env,PATH:bin+path.delimiter+process.env.PATH,...env}});
 const remote=(shaArg=sha,env={})=>run('receive-production.sh',[root,bundle,shaArg,path.join(aux,'conda.sh'),'xbaer-web','http://127.0.0.1:8080','http://10.103.2.100:8080/'],env);
 return {root,sha,run,remote,clean:()=>{fs.rmSync(root,{recursive:true,force:true});fs.rmSync(aux,{recursive:true,force:true});}};
}
test('local check runs tests without SSH, dirty tree and test failures stop',()=>{const f=fixture();try{
 assert.equal(f.run('push-production.sh',['--check']).status,0);
 assert.notEqual(f.run('push-production.sh',[],{FAIL_TEST:'7'}).status,0);
 fs.writeFileSync(path.join(f.root,'dirty'),'x');assert.notEqual(f.run('push-production.sh',['--check']).status,0);
}finally{f.clean();}});
test('remote success activates only child environment, verifies state and HTTP',()=>{const f=fixture();try{
 const old=process.env.CONDA_DEFAULT_ENV;const r=f.remote();assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/Deployment verified/);assert.equal(process.env.CONDA_DEFAULT_ENV,old);assert.equal(fs.existsSync(path.join(f.root,'.production/push-lock')),false);
}finally{f.clean();}});
test('SHA mismatch, build failure, HTTP failure exit nonzero and release push lock',()=>{for(const scenario of ['sha','build','http']){const f=fixture();try{
 if(scenario==='build')fs.writeFileSync(path.join(f.root,'.production/fail-build'),'1');
 if(scenario==='http')fs.writeFileSync(path.join(f.root,'.production/fail-http'),'1');
 const r=f.remote(scenario==='sha'?'a'.repeat(40):f.sha,scenario==='build'?{FAIL_BUILD:'1'}:scenario==='http'?{HTTP_STATUS:'503'}:{});
 assert.notEqual(r.status,0,scenario+": "+r.stdout+r.stderr);assert.equal(fs.readFileSync(path.join(f.root,'dist/index.html'),'utf8'),'working');assert.equal(fs.existsSync(path.join(f.root,'.production/push-lock')),false);assert.doesNotMatch(r.stdout,/Deployment verified/);
}finally{f.clean();}}});
