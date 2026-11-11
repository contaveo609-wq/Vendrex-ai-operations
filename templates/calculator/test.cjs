const assert=require('node:assert/strict');
const {Calculator}=require('./engine.js');
let count=0;
function run(a,op,b,expected){const c=new Calculator();for(const x of String(a)){if(x==='.')c.decimal();else if(x==='-'){}else c.digit(x);}if(a<0)c.sign();c.operation(op);for(const x of String(b)){if(x==='.')c.decimal();else if(x==='-'){}else c.digit(x);}if(b<0)c.sign();assert.equal(c.equals(),expected);count++;}
run(2,'+',3,'5');run(10,'-',7,'3');run(7,'*',8,'56');run(81,'/',9,'9');run(0.1,'+',0.2,'0.3');run(1.5,'*',2,'3');run(-5,'+',2,'-3');run(5,'-',8,'-3');run(3,'/',2,'1.5');run(0,'*',7,'0');
const c=new Calculator();c.digit('5');c.operation('/');c.digit('0');assert.match(c.equals(),/zero/);count++;c.digit('2');assert.equal(c.display(),'2');count++;c.digit('0');c.percent();assert.equal(c.display(),'0.2');count++;c.clear();c.decimal();c.decimal();assert.equal(c.display(),'0.');count++;c.digit('5');c.backspace();assert.equal(c.display(),'0.');count++;assert.throws(()=>c.operation('eval'));count++;assert.throws(()=>c.digit('x'));count++;console.log(`${count} testes de aritmética e entradas passaram.`);
