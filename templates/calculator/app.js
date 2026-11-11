'use strict';
const calculator=new Calculator();
const result=document.getElementById('result');
const expression=document.getElementById('expression');
function act(key){
  try{
    if(/^\d$/.test(key))calculator.digit(key);
    else if(key==='.')calculator.decimal();
    else if(key==='AC')calculator.clear();
    else if(key==='sign')calculator.sign();
    else if(key==='%')calculator.percent();
    else if(key==='backspace')calculator.backspace();
    else if(key==='=')calculator.equals();
    else calculator.operation(key);
    result.textContent=calculator.display().replace('.',',');
    expression.textContent=calculator.operator?`${calculator.accumulator} ${calculator.operator==='*'?'×':calculator.operator==='/'?'÷':calculator.operator}`:'Pronta para sua próxima conta';
    result.classList.toggle('error',calculator.error);
  }catch(error){result.textContent=error.message;result.classList.add('error');}
}
document.querySelectorAll('[data-key]').forEach(button=>button.addEventListener('click',()=>act(button.dataset.key)));
document.addEventListener('keydown',event=>{
  if(event.ctrlKey||event.altKey||event.metaKey)return;
  const map={Enter:'=',Escape:'AC',Backspace:'backspace',',':'.','x':'*','X':'*'};
  const key=map[event.key]||event.key;
  if(/^[0-9.+*/%=\-]$/.test(key)||['AC','backspace'].includes(key)){event.preventDefault();act(key);}
});
