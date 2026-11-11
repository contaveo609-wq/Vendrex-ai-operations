'use strict';
class Calculator {
  constructor(){this.clear();}
  clear(){this.current='0';this.accumulator=null;this.operator=null;this.fresh=true;this.error=false;return this.current;}
  display(){return this.error?'Não é possível dividir por zero':this.current;}
  digit(value){
    if(!/^\d$/.test(value))throw new Error('Dígito inválido');
    if(this.error)this.clear();
    if(this.fresh){this.current=value;this.fresh=false;}
    else if(this.current.length<16)this.current=this.current==='0'?value:this.current+value;
    return this.current;
  }
  decimal(){if(this.error)this.clear();if(this.fresh){this.current='0.';this.fresh=false;}else if(!this.current.includes('.'))this.current+='.';return this.current;}
  sign(){if(!this.error&&Number(this.current)!==0)this.current=this.current.startsWith('-')?this.current.slice(1):'-'+this.current;return this.current;}
  percent(){if(!this.error)this.current=this.format(Number(this.current)/100);return this.current;}
  backspace(){if(this.error)return this.clear();if(!this.fresh)this.current=this.current.length>1?this.current.slice(0,-1):'0';if(this.current==='-')this.current='0';return this.current;}
  format(number){if(!Number.isFinite(number))throw new Error('Resultado fora do limite');return String(Number(number.toPrecision(12)));}
  operation(operator){
    if(!['+','-','*','/'].includes(operator))throw new Error('Operação inválida');
    if(this.error)return this.display();
    if(this.operator&&!this.fresh)this.equals();
    if(this.error)return this.display();
    this.accumulator=Number(this.current);this.operator=operator;this.fresh=true;return this.current;
  }
  equals(){
    if(this.error||!this.operator||this.accumulator===null)return this.display();
    const a=this.accumulator,b=Number(this.current),op=this.operator;
    if(op==='/'&&b===0){this.error=true;this.operator=null;this.accumulator=null;return this.display();}
    this.current=this.format(op==='+'?a+b:op==='-'?a-b:op==='*'?a*b:a/b);
    this.operator=null;this.accumulator=null;this.fresh=true;return this.current;
  }
}
if(typeof module!=='undefined')module.exports={Calculator};
if(typeof window!=='undefined')window.Calculator=Calculator;
