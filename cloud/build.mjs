import {mkdir,copyFile} from 'node:fs/promises';
await mkdir('dist',{recursive:true});
for(const file of ['index.html','app.js','style.css'])await copyFile('public/'+file,'dist/'+file);
console.log('Control plane static build complete. API config comes from server runtime environment.');
