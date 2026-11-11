const assert=require('node:assert/strict');const {validate}=require('./app.js');
assert.deepEqual(validate([]),[]);
const row={id:'1',title:'Implementar persistência',stage:'A fazer'};assert.equal(validate([row])[0].title,row.title);
for(const invalid of [[{...row,stage:'ausente'}],[row,row],[{...row,title:''}],[{...row,title:'a'.repeat(121)}],null])assert.throws(()=>validate(invalid));
console.log('7 verificações de contrato do quadro passaram. Persistência e DOM exigem teste Chromium.');
