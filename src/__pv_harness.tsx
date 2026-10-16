
import React from 'react'; import {createRoot} from 'react-dom/client'; import {MemoryRouter} from 'react-router-dom';
import '/src/index.css'; import '/src/components/portal/mooney/mooney.css';
import {GearProductView} from '/src/components/portal/mooney/GearProductView.tsx';
const svg=(c)=>'data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="${c}"/></svg>`);
const img=(id,c,sid,view)=>({id,url:svg(c),is_primary:false,sort_order:0,shopifyImageId:sid,portalView:view});
const v=(c,sid)=>({id:c,productId:'p',shopifyVariantId:c,sku:null,title:null,color:c,size:'M',price:null,compareAtPrice:null,available:true,inventoryQuantity:null,inventoryPolicy:null,position:null,shopifyImageId:sid,metadata:{},syncedAt:null});
const product={id:'p',title:'Moon Era Heavyweight Tee',slug:'t',status:'published',product_type:'tee',shopify_handle:'tee',blank_id:null,primary_image_url:null,
images:[img('1','#222','s1','front'),img('2','#444','s2','back'),img('3','#a0522d','s3',null)],price:null,wholesale_price:18,athlete_unit_price:16.5,
variants:[v('Black','s1'),v('Mocha','s3')],sizes:['M'],colors:[{name:'Black',hex:'#111'},{name:'Mocha',hex:'#7b5a44'},{name:'Shadow',hex:'#555'},{name:'Charcoal',hex:'#333'},{name:'Cream',hex:'#eee3cc'}],created_at:''};
createRoot(document.getElementById('root')).render(<MemoryRouter><div className="mw-shell"><div className="mw-room-ground"><GearProductView product={product} description="<p>Heavyweight cotton.</p>"/></div></div></MemoryRouter>);
