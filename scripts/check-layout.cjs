'use strict';
const {execFileSync}=require('node:child_process');
const path=require('node:path');
const fs=require('node:fs');
const root=path.resolve(__dirname,'..');
const allowed=new Set([".github", ".gitignore", "AGENTS.md", "Build_Windows.cmd", "DEVELOPMENT_HANDOFF.md", "README.md", "app", "assets", "browser", "cad_source", "docs", "package-lock.json", "package.json", "release-validation.json", "scripts", "validation"]);
let files;
if(fs.existsSync(path.join(root,'.git'))){
files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
}else{
  // GitHub source archives have no Git metadata. Exclude only documented build outputs.
  files=fs.readdirSync(root).filter(n=>!['node_modules','dist'].includes(n));
}

const unexpected=[...new Set(files.map(f=>f.split('/')[0]))].filter(n=>!allowed.has(n));
if(unexpected.length)throw Error('Unexpected repository-root entries: '+unexpected.join(', ')+'. Use the documented folders; do not expand this allowlist for release notes or generated files.');
console.log('Repository layout OK ('+[...new Set(files.map(f=>f.split('/')[0]))].length+' root entries).');
