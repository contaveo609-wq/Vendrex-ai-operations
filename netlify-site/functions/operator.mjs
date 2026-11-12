import {createOperatorHandler} from '../lib/operator.mjs';
export default (request,context)=>createOperatorHandler({env:name=>Netlify.env.get(name)})(request,context);
export const config={path:'/api/*',method:['GET','POST']};
