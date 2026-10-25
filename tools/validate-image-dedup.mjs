import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {existsSync, lstatSync, readFileSync} from 'node:fs';
import {extname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

// Current tracked assets plus additions under review. History is intentionally untouched.
const root=fileURLToPath(new URL('../',import.meta.url));
const names=[...new Set(execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],
 {cwd:root,encoding:'utf8'}).split('\0').filter(Boolean))];
const extensions=new Set(['.jpg','.jpeg','.png','.webp','.gif','.svg','.ico']);
const groups=new Map();let paths=0,totalBytes=0;
for(const name of names) {
 if(!extensions.has(extname(name).toLowerCase()))continue;
 const target=join(root,name);
 if(!existsSync(target))continue; // A reviewed current-tree deletion remains available in Git history.
 if(!lstatSync(target).isFile())throw new Error(`Image asset is not an ordinary file: ${name}`);
 const raw=readFileSync(target),sha256=createHash('sha256').update(raw).digest('hex');
 const item=groups.get(sha256)??{sha256,sizeBytes:raw.length,paths:[]};item.paths.push(name);groups.set(sha256,item);
 paths++;totalBytes+=raw.length;
}
const duplicates=[...groups.values()].filter(item=>item.paths.length>1);
console.log(JSON.stringify({imagePaths:paths,distinctSha256:groups.size,totalBytes,
 duplicateGroups:duplicates,duplicateExtraBytes:duplicates.reduce((sum,item)=>sum+item.sizeBytes*(item.paths.length-1),0)},null,2));
if(duplicates.length)process.exitCode=1;
