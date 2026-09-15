import { defineConfig } from 'vite';
import { createHash } from 'node:crypto';
import { readFileSync,readdirSync } from 'node:fs';
import { resolve,relative } from 'node:path';

const root=import.meta.dirname;
function sourceFiles(dir){
  return readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?sourceFiles(resolve(dir,entry.name)):[resolve(dir,entry.name)]).sort();
}
export default defineConfig(()=>{
const hash=createHash('sha256');
for(const file of [...sourceFiles(resolve(root,'src')),resolve(root,'index.html'),resolve(root,'package-lock.json')]){
  hash.update(relative(root,file));hash.update(readFileSync(file));
}
return {
  define:{__BUILD_ID__:JSON.stringify(hash.digest('hex').slice(0,12))},
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three/')) return 'three';
        },
      },
    },
  },
};
});
