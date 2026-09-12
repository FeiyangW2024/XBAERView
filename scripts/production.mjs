/** Local production transactions. Requires Node + Git + npm; no network Git calls. */
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=process.cwd(), stateDir=path.join(root,'.production');
const stateFile=path.join(stateDir,'state.json'), journal=path.join(stateDir,'journal.json');
const [action,...args]=process.argv.slice(2);
const fail=m=>{throw Error(m);};
const run=(cmd,args,cwd=root)=>execFileSync(cmd,args,{cwd,stdio:['ignore','pipe','pipe'],maxBuffer:100*1024*1024}).toString().trim();
const git=(...a)=>run('git',a);
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const exists=p=>fs.existsSync(p);
const atomic=(p,obj)=>{fs.writeFileSync(p+'.tmp',JSON.stringify(obj,null,2)+'\n',{mode:0o600});fs.renameSync(p+'.tmp',p);};
const protectedPath=p=>p==='dist'||p.startsWith('dist/')||p==='deploy'||p.startsWith('deploy/')||p==='config/deployment.linux.json'||p==='.production'||p.startsWith('.production/');
function checkCommit(commit){
 const sha=git('rev-parse','--verify',commit+'^{commit}');
 if(git('ls-tree','-r','--name-only',sha).split('\n').some(protectedPath))fail('Commit tracks server-owned files; remove these from Git before deploying/rolling back');
 if(JSON.parse(git('show',sha+':package.json')).name!=='xbaer-view')fail('Target is not XBAER View');
 return sha;
}
function validateConfig(p){const c=read(p);if(!c.members||!Object.keys(c.members).length||typeof c.basemapRoot!=='string')fail('Invalid server config: members/basemapRoot required');for(const m of Object.values(c.members))if(typeof m.catalogUrl!=='string')fail('Invalid member catalogUrl');}
function validateDist(p){
 if(!fs.statSync(path.join(p,'index.html')).isFile())fail('Missing index.html');
 validateConfig(path.join(p,'config.json'));
 const html=fs.readFileSync(path.join(p,'index.html'),'utf8');
 for(const match of html.matchAll(/(?:src|href)=["'](\/assets\/[^"']+)["']/g))if(!exists(path.join(p,match[1])))fail('Missing asset '+match[1]);
}
function permissions(p){for(const entry of fs.readdirSync(p,{withFileTypes:true})){const f=path.join(p,entry.name);if(entry.isSymbolicLink())fail('Release may not contain symlinks');if(entry.isDirectory())permissions(f);else fs.chmodSync(f,0o644);}fs.chmodSync(p,0o755);}
function digest(p){const hash=crypto.createHash('sha256');function walk(d){for(const n of fs.readdirSync(d).sort()){const f=path.join(d,n),st=fs.lstatSync(f);if(st.isSymbolicLink())fail('Unexpected release symlink');if(st.isDirectory())walk(f);else{hash.update(path.relative(p,f));hash.update(fs.readFileSync(f));}}}walk(p);return hash.digest('hex');}
function snapshot(folder,commit){const id=Date.now()+'-'+crypto.randomBytes(4).toString('hex'),dest=path.join(stateDir,'releases',id);fs.cpSync(folder,dest,{recursive:true});validateDist(dest);permissions(dest);return {id,commit,hash:digest(dest)};}
function release(info){if(!info||!/^\d+-[a-f0-9]+$/.test(info.id))fail('Invalid release ID');const p=path.join(stateDir,'releases',info.id);if(digest(p)!==info.hash)fail('Release integrity mismatch: '+info.id);validateDist(p);return p;}
function pointTo(info){
 const dest=release(info),link=path.join(root,'.production-link');
 const stale=fs.lstatSync(link,{throwIfNoEntry:false});
 if(stale){if(!stale.isSymbolicLink()||!fs.readlinkSync(link).startsWith('.production/releases/'))fail('Unexpected .production-link; inspect before retry');fs.unlinkSync(link);}
 fs.symlinkSync(path.relative(root,dest),link,'dir');
 try{fs.renameSync(link,path.join(root,'dist'));}finally{if(fs.lstatSync(link,{throwIfNoEntry:false}))fs.unlinkSync(link);}
}
function clean(){if(git('status','--porcelain','--untracked-files=normal'))fail('Working tree must be clean, including untracked files. Commit code changes first; server files must be ignored.');}
function restore(tx){
 // Restore serving files first, then source. Keep journal on any recovery failure.
 const dist=path.join(root,'dist');
 if(tx.directoryBackup && exists(tx.directoryBackup)){
  if(fs.lstatSync(dist,{throwIfNoEntry:false})?.isSymbolicLink())fs.unlinkSync(dist);
  if(!exists(dist))fs.renameSync(tx.directoryBackup,dist);
 }else if(tx.directoryBackup && fs.lstatSync(dist,{throwIfNoEntry:false})?.isDirectory()){
  if(digest(dist)!==tx.before.current.hash)fail('Original dist changed; refusing recovery overwrite');
 }else pointTo(tx.before.current);
 if(git('rev-parse','HEAD')!==tx.sourceCommit){git('switch','--detach',tx.sourceCommit);if(tx.sourceBranch)git('switch',tx.sourceBranch);}
 atomic(stateFile,tx.before);fs.unlinkSync(journal);
}
function main(){
let locked=false;
try{
 if(!['deploy','rollback'].includes(action))fail('Unknown operation');
 if(args.includes('--help')){console.log('Run from XBAER View root. deploy: [--adopt-current COMMIT] [--check] [--recover]; rollback: [--check] [--recover]. No git pull/fetch.');return;}
 let adopt=null,check=false,recover=false;
 for(let i=0;i<args.length;i++){if(args[i]==='--adopt-current'&&action==='deploy')adopt=args[++i]||fail('Missing commit');else if(args[i]==='--check')check=true;else if(args[i]==='--recover')recover=true;else fail('Unknown argument: '+args[i]);}
 if(read(path.join(root,'package.json')).name!=='xbaer-view'||!exists('package-lock.json')||!exists('src/main.ts')||git('rev-parse','--show-toplevel')!==root)fail('Run from the XBAER View Git project root');
 if(!exists('deploy/config.json'))fail('Missing deploy/config.json');validateConfig('deploy/config.json');
 const head=checkCommit('HEAD');
 for(const p of ['deploy/config.json','dist','config/deployment.linux.json','.production/state.json'])if(!git('check-ignore','--',p))fail('Server file is not ignored: '+p);
 if(check&&recover)fail('--check and --recover cannot be combined');
 if(check){clean();if(action==='rollback')release(read(stateFile).previous);console.log('Preflight OK; no production files changed');return;}
 if(fs.lstatSync(stateDir,{throwIfNoEntry:false})?.isSymbolicLink())fail('.production cannot be a symlink');
 fs.mkdirSync(stateDir,{recursive:true,mode:0o755});fs.chmodSync(stateDir,0o755);
 fs.mkdirSync(path.join(stateDir,'releases'),{recursive:true});fs.chmodSync(path.join(stateDir,'releases'),0o755);
 fs.mkdirSync(path.join(stateDir,'lock'));locked=true;
 if(exists(journal)){if(!recover)fail('Interrupted transaction found. Inspect .production/journal.json then run --recover');restore(read(journal));console.log('Recovered previous production and source');return;}
 if(recover)fail('No interrupted transaction');
 // Persist ignore rules and management entry points across checkout of older commits.
 const exclude=path.resolve(root,git('rev-parse','--git-path','info/exclude'));
 fs.mkdirSync(path.dirname(exclude),{recursive:true});
 const excludes=exists(exclude)?fs.readFileSync(exclude,'utf8'):'';
 const rules=['/dist','/deploy/','/config/deployment.linux.json','/.production/','/.production-link'];
 const missing=rules.filter(rule=>!excludes.split('\n').includes(rule));
 if(missing.length)fs.appendFileSync(exclude,'\n'+missing.join('\n')+'\n');
 const toolsDir=path.dirname(fileURLToPath(import.meta.url));
 for(const name of ['production.mjs','deploy-production.sh','rollback-production.sh']){
  const source=path.join(toolsDir,name),target=path.join(stateDir,name);
  if(source!==target)fs.copyFileSync(source,target);
 }
 clean();
 let state=exists(stateFile)?read(stateFile):null;
 if(!state){
  if(!adopt)fail('First deployment requires --adopt-current COMMIT matching the running dist; verify it manually first');
  const commit=checkCommit(adopt);validateDist('dist');
  if(fs.lstatSync('dist').isSymbolicLink())fail('Initial dist must be a real directory');
  state={current:snapshot('dist',commit),previous:null};atomic(stateFile,state);
 }else if(adopt)fail('Already initialized; --adopt-current is first-use only');
 release(state.current);
 const currentPath=fs.realpathSync('dist');
 if(digest(currentPath)!==state.current.hash)fail('Serving dist differs from recorded last-good; inspect manual changes before continuing');
 const stage=fs.mkdtempSync(path.join(stateDir,'stage-'));let candidate;
 try{
  if(action==='deploy'){
   const archive=execFileSync('git',['archive',head],{cwd:root,maxBuffer:100*1024*1024});
   execFileSync('tar',['-x','-C',stage],{input:archive});
   console.log('Building commit',head,'in isolated staging directory');
   execFileSync('npm',['ci','--include=dev','--no-audit','--no-fund'],{cwd:stage,stdio:'inherit'});
   execFileSync('npm',['run','build'],{cwd:stage,stdio:'inherit'});
   fs.copyFileSync('deploy/config.json',path.join(stage,'dist/config.json'));validateDist(path.join(stage,'dist'));
   if(git('rev-parse','HEAD')!==head)fail('HEAD changed during build');clean();candidate=snapshot(path.join(stage,'dist'),head);
  }else{
   if(!state.previous)fail('No previous confirmed production release');checkCommit(state.previous.commit);
   fs.cpSync(release(state.previous),path.join(stage,'dist'),{recursive:true});
   fs.copyFileSync('deploy/config.json',path.join(stage,'dist/config.json'));candidate=snapshot(path.join(stage,'dist'),state.previous.commit);
  }
  let branch='';try{branch=git('symbolic-ref','--quiet','--short','HEAD');}catch{}
  const tx={before:state,sourceCommit:head,sourceBranch:branch,directoryBackup:null};
  if(!fs.lstatSync('dist').isSymbolicLink())tx.directoryBackup=path.join(stateDir,'initial-dist-'+Date.now());
  atomic(journal,tx);
  try{
   if(action==='rollback')git('switch','--detach',candidate.commit);
   if(tx.directoryBackup)fs.renameSync('dist',tx.directoryBackup);
   pointTo(candidate);validateDist('dist');
   atomic(stateFile,{current:candidate,previous:state.current});
   fs.unlinkSync(journal);
   console.log(action+' complete. production/last-good = '+candidate.commit+'; previous = '+state.current.commit);
  }catch(error){try{restore(tx);}catch(recovery){console.error('RECOVERY FAILED; journal and backups retained:',recovery.message);}throw error;}
 }finally{fs.rmSync(stage,{recursive:true,force:true});}
}catch(error){console.error('Production operation failed:',error.message);process.exitCode=1;}
finally{if(locked)fs.rmdirSync(path.join(stateDir,'lock'));}

}
main();
