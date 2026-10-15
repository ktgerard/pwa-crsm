
const cfg=window.CUTROOM_CONFIG;
const db=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseKey);
const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
let items=[], vendors=[], groups=[], vendorItems=[], currentVendor='All', currentSession=null, counts=new Map(), orderSession=null, orderCounts=new Map(), orderDraft=new Map();

function esc(v=''){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function money(v){return v==null||v===''?'—':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(v)}
function viFor(id){return vendorItems.find(x=>x.supply_item_id===id&&x.preferred_flag&&x.active_flag)||vendorItems.find(x=>x.supply_item_id===id)}
function vendorName(id){return vendors.find(v=>v.vendor_id===id)?.vendor_name||''}
function groupFor(id){return groups.find(g=>g.presentation_group_id===id)}

async function boot(){
  const {data:{session}}=await db.auth.getSession();
  setAuth(session);
  db.auth.onAuthStateChange((_e,s)=>setAuth(s));
}
function setAuth(session){
  $('#loginView').classList.toggle('hidden',!!session);
  $('#appView').classList.toggle('hidden',!session);
  $('#signOutBtn').classList.toggle('hidden',!session);
  $('#statusText').textContent=session?session.user.email:'Not signed in';
  if(session) loadData();
}
$('#signInBtn').onclick=async()=>{
  $('#loginMsg').textContent='Signing in…';
  const {error}=await db.auth.signInWithPassword({email:$('#email').value.trim(),password:$('#password').value});
  $('#loginMsg').textContent=error?error.message:'';
};
$('#signOutBtn').onclick=()=>db.auth.signOut();

async function loadData(){
  const [v,i,vi,g]=await Promise.all([
    db.from('cutroom_vendors').select('*').eq('active_flag',true).order('sort_order'),
    db.from('cutroom_supply_items').select('*').eq('active_flag',true),
    db.from('cutroom_vendor_items').select('*').eq('active_flag',true),
    db.from('cutroom_presentation_groups').select('*').eq('active_flag',true).order('sort_order')
  ]);
  const err=v.error||i.error||vi.error||g.error;
  if(err){$('#statusText').textContent='Load error: '+err.message;return}
  vendors=v.data;items=i.data;vendorItems=vi.data;groups=g.data;
  renderVendorTabs();renderMaster();await resumeDraft();renderCount();
}

function renderVendorTabs(){
  $('#vendorTabs').innerHTML=['All',...vendors.map(v=>v.vendor_name)].map(n=>`<button class="${n===currentVendor?'active':''}" data-v="${esc(n)}">${esc(n)}</button>`).join('');
  $$('#vendorTabs button').forEach(b=>b.onclick=()=>{currentVendor=b.dataset.v;renderVendorTabs();renderMaster()});
}
function renderMaster(){
  const q=$('#search').value.trim().toLowerCase();
  const sorted=[...items].sort((a,b)=>{
    const ga=groupFor(a.presentation_group_id)?.sort_order??999, gb=groupFor(b.presentation_group_id)?.sort_order??999;
    return ga-gb||(a.presentation_sort_order??9999)-(b.presentation_sort_order??9999)||a.item_description.localeCompare(b.item_description)
  }).filter(i=>{
    const vi=viFor(i.supply_item_id), vn=vi?vendorName(vi.vendor_id):'';
    const hay=[i.item_description,i.category,vi?.sku,vi?.vendor_part_number,vn].join(' ').toLowerCase();
    return (currentVendor==='All'||vn===currentVendor)&&(!q||hay.includes(q));
  });
  $('#masterList').innerHTML=`<div class="supply-row head"><div>Item</div><div>Vendor</div><div>SKU / Part #</div><div>Min</div><div>Max</div><div class="money">Price</div></div>`+
  sorted.map(i=>{const vi=viFor(i.supply_item_id);return `<div class="supply-row">
    <div><div class="item-name">${esc(i.item_description)}</div><div class="sub">${esc(i.category||'')} · ${esc(groupFor(i.presentation_group_id)?.group_name||'Unassigned')}</div></div>
    <div>${esc(vi?vendorName(vi.vendor_id):'—')}</div>
    <div>${esc(vi?.sku||'—')}<div class="sub">${esc(vi?.vendor_part_number||'—')}</div></div>
    <div>${esc(i.minimum_quantity??'—')}</div><div>${esc(i.maximum_quantity??'—')}</div>
    <div class="money">${money(vi?.current_price)}</div></div>`}).join('');
}
$('#search').oninput=renderMaster;

$$('.main-tabs button').forEach(b=>b.onclick=()=>{
  $$('.main-tabs button').forEach(x=>x.classList.toggle('active',x===b));
  $('#masterView').classList.toggle('hidden',b.dataset.view!=='master');
  $('#countView').classList.toggle('hidden',b.dataset.view!=='count');
  $('#orderView').classList.toggle('hidden',b.dataset.view!=='order');
  $('#historyView').classList.toggle('hidden',b.dataset.view!=='history');
  if(b.dataset.view==='history') loadOrderHistory();
  if(b.dataset.view==='order') refreshOrderReview();
});

async function resumeDraft(){
 const {data,error}=await db.from('cutroom_inventory_sessions').select('*').eq('status','draft').order('created_at',{ascending:false}).limit(1);
 if(error||!data?.length){currentSession=null;counts.clear();return}
 currentSession=data[0]; const r=await db.from('cutroom_inventory_counts').select('*').eq('inventory_session_id',currentSession.inventory_session_id);
 counts=new Map((r.data||[]).map(x=>[x.supply_item_id,x]));
}
function countableItems(){const ids=new Set(groups.filter(g=>g.count_monthly_flag).map(g=>g.presentation_group_id));return items.filter(i=>i.count_monthly_flag&&ids.has(i.presentation_group_id))}
async function createCount(){const {data,error}=await db.from('cutroom_inventory_sessions').insert({status:'draft'}).select().single();if(error){alert(error.message);return}currentSession=data;counts.clear();renderCount()}
$('#newCountBtn').onclick=async()=>{if(currentSession){renderCount();return}await createCount()};
$('#discardCountBtn').onclick=async()=>{if(!currentSession||!confirm(`Discard this draft and its ${counts.size} saved count${counts.size===1?'':'s'}?`))return;let r=await db.from('cutroom_inventory_counts').delete().eq('inventory_session_id',currentSession.inventory_session_id);if(r.error){alert(r.error.message);return}r=await db.from('cutroom_inventory_sessions').delete().eq('inventory_session_id',currentSession.inventory_session_id);if(r.error){alert(r.error.message);return}currentSession=null;counts.clear();await createCount()};
function suggestion(i,q){if(q===''||q==null||i.minimum_quantity==null||i.maximum_quantity==null)return null;q=Number(q);return q<Number(i.minimum_quantity)?Math.max(Number(i.maximum_quantity)-q,0):0}
const timers=new Map();
const saving=new Set();
const pending=new Set();
function queueSave(i,input,{immediate=false}={}){
 if(!currentSession){alert('Start a new count first.');input.value='';return}
 const id=i.supply_item_id,badge=input.closest('.count-row').querySelector('.save-state');
 clearTimeout(timers.get(id));pending.add(id);badge.textContent='Pending…';badge.className='save-state saving-badge';
 if(immediate)saveCount(i,input,badge);else timers.set(id,setTimeout(()=>saveCount(i,input,badge),300));
}
async function saveCount(i,input,badge){
 const id=i.supply_item_id;if(saving.has(id))return;
 clearTimeout(timers.get(id));timers.delete(id);pending.delete(id);saving.add(id);
 badge.textContent='Saving…';badge.className='save-state saving-badge';
 try{
  const raw=input.value.trim();
  if(raw===''){
   if(counts.has(id)){const {error}=await db.from('cutroom_inventory_counts').delete().eq('inventory_session_id',currentSession.inventory_session_id).eq('supply_item_id',id);if(error)throw error;counts.delete(id)}
  }else{
   const q=Number(raw);if(!Number.isFinite(q)||q<0)throw new Error('Invalid quantity');
   const payload={inventory_session_id:currentSession.inventory_session_id,supply_item_id:id,quantity_on_hand:q,suggested_order_quantity:suggestion(i,q)??0};
   const {data,error}=await db.from('cutroom_inventory_counts').upsert(payload,{onConflict:'inventory_session_id,supply_item_id'}).select().single();if(error)throw error;counts.set(id,data);
  }
  badge.textContent='Saved';badge.className='save-state saved-badge';updateProgress();
 }catch(e){badge.textContent='Save failed';badge.className='save-state save-error';badge.title=e.message||String(e)}
 finally{saving.delete(id);if(pending.has(id))saveCount(i,input,badge)}
}
async function flushPendingSaves(){
 for(const inp of $$('#countGroups input')){const id=inp.dataset.id;if(pending.has(id)){const item=items.find(i=>i.supply_item_id===id);await saveCount(item,inp,inp.closest('.count-row').querySelector('.save-state'))}}
 while(saving.size)await new Promise(r=>setTimeout(r,25));
}

function updateProgress(){const monthly=countableItems();$('#sessionMeta').textContent=currentSession?`${counts.size?`${counts.size} of ${monthly.length} items saved`:'Empty draft'} · Started ${new Date(currentSession.created_at).toLocaleString()}`:'Start a count to enter quantities.';groups.filter(g=>g.count_monthly_flag).forEach(g=>{const list=monthly.filter(i=>i.presentation_group_id===g.presentation_group_id),el=document.querySelector(`[data-progress="${g.presentation_group_id}"]`);if(el)el.textContent=`${list.filter(i=>counts.has(i.supply_item_id)).length} of ${list.length} counted`})}
function renderCount(){const monthly=countableItems();$('#sessionTitle').textContent=currentSession?(counts.size?'Monthly Count — Draft':'Monthly Count — Empty Draft'):'No active count';$('#sessionMeta').textContent=currentSession?`${counts.size?`${counts.size} of ${monthly.length} items saved`:'Empty draft'} · Started ${new Date(currentSession.created_at).toLocaleString()}`:'Start a count to enter quantities.';$('#newCountBtn').textContent=currentSession?'Resume Draft Count':'Start New Count';$('#discardCountBtn').classList.toggle('hidden',!currentSession);$('#completeCountBtn').classList.toggle('hidden',!currentSession);$('#countGroups').innerHTML=groups.filter(g=>g.count_monthly_flag).map(g=>{const list=monthly.filter(i=>i.presentation_group_id===g.presentation_group_id).sort((a,b)=>(a.presentation_sort_order??9999)-(b.presentation_sort_order??9999));const done=list.filter(i=>counts.has(i.supply_item_id)).length;return `<details class="group" open><summary><span>${esc(g.group_name)}</span><span data-progress="${g.presentation_group_id}">${done} of ${list.length} counted</span></summary>${list.map(i=>{const c=counts.get(i.supply_item_id),q=c?.quantity_on_hand??'',sg=q===''?null:suggestion(i,q);return `<div class="count-row ${sg>0?'order-needed':''}"><div><div class="item-name">${esc(i.item_description)}</div><div class="sub">${esc(vendorName(viFor(i.supply_item_id)?.vendor_id)||'')}</div><span class="save-state ${c?'saved-badge':''}">${c?'Saved':''}</span></div><div><span class="sub">Min</span><br>${esc(i.minimum_quantity??'—')}</div><div><span class="sub">Max</span><br>${esc(i.maximum_quantity??'—')}</div><div><input inputmode="decimal" type="number" min="0" step="any" value="${esc(q)}" data-id="${i.supply_item_id}" placeholder="Qty"></div><div><span class="sub">Suggested order</span><br><span class="suggest">${sg==null?'—':sg}</span></div></div>`}).join('')}</details>`}).join('');$$('#countGroups input').forEach(inp=>{const item=items.find(i=>i.supply_item_id===inp.dataset.id);inp.oninput=()=>{const sg=suggestion(item,inp.value),row=inp.closest('.count-row');row.querySelector('.suggest').textContent=sg==null?'—':sg;row.classList.toggle('order-needed',sg>0);queueSave(item,inp)};inp.onblur=()=>queueSave(item,inp,{immediate:true});inp.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();queueSave(item,inp,{immediate:true});inp.blur()}}})}
$('#completeCountBtn').onclick=async()=>{await flushPendingSaves();const monthly=countableItems();if(counts.size<monthly.length&&!confirm(`Only ${counts.size} of ${monthly.length} monthly items have been saved. Complete anyway?`))return;const {error}=await db.from('cutroom_inventory_sessions').update({status:'completed',completed_at:new Date().toISOString()}).eq('inventory_session_id',currentSession.inventory_session_id);if(error){alert(error.message);return}alert('Monthly count completed.');currentSession=null;counts.clear();renderCount()};


async function loadOrderSource(){
  if(currentSession){
    orderSession=currentSession;
    orderCounts=new Map(counts);
    return true;
  }
  const {data:sessions,error}=await db.from('cutroom_inventory_sessions').select('*').eq('status','completed').order('completed_at',{ascending:false}).limit(1);
  if(error){alert(error.message);return false}
  if(!sessions?.length){orderSession=null;orderCounts.clear();return false}
  orderSession=sessions[0];
  const {data,error:countError}=await db.from('cutroom_inventory_counts').select('*').eq('inventory_session_id',orderSession.inventory_session_id);
  if(countError){alert(countError.message);return false}
  orderCounts=new Map((data||[]).map(x=>[x.supply_item_id,x]));
  return true;
}
async function refreshOrderReview(){
  const ok=await loadOrderSource();
  orderDraft.clear();
  if(!ok){
    $('#orderMeta').textContent='No draft or completed inventory count is available yet.';
    $('#orderGroups').innerHTML='';
    $('#generateOrderBtn').classList.add('hidden');
    return;
  }
  countableItems().forEach(item=>{
    const c=orderCounts.get(item.supply_item_id);
    if(!c)return;
    const suggested=Math.max(0,Number(c.suggested_order_quantity||0));
    if(suggested<=0)return;
    const vi=viFor(item.supply_item_id);
    if(!vi)return;
    orderDraft.set(item.supply_item_id,{item,count:c,vi,orderQty:suggested});
  });
  renderOrderReview();
}
function renderOrderReview(){
  const host=$('#orderGroups');host.innerHTML='';
  const sourceLabel=orderSession?.status==='draft'?'current draft':'latest completed count';
  if(!orderDraft.size){
    $('#orderMeta').textContent=`Using ${sourceLabel}. No items currently need replenishment.`;
    $('#generateOrderBtn').classList.add('hidden');
    return;
  }
  const byVendor=new Map();
  [...orderDraft.values()].forEach(x=>{
    const name=vendorName(x.vi.vendor_id)||'Unassigned Vendor';
    if(!byVendor.has(name))byVendor.set(name,[]);
    byVendor.get(name).push(x);
  });
  let grand=0,lineCount=0;
  [...byVendor.entries()].sort((a,b)=>a[0].localeCompare(b[0])).forEach(([name,rows])=>{
    const card=document.createElement('section');card.className='card order-card';
    card.innerHTML=`<h3>${esc(name)}</h3>`;
    const table=document.createElement('table');table.className='order-table';
    table.innerHTML='<thead><tr><th>Item</th><th>SKU / Part #</th><th>On Hand</th><th>Min</th><th>Max</th><th>Suggested</th><th>Order Qty</th><th>Unit</th><th>Ext.</th></tr></thead>';
    const body=document.createElement('tbody');let vendorTotal=0;
    rows.sort((a,b)=>a.item.item_description.localeCompare(b.item.item_description)).forEach(x=>{
      const price=Number(x.vi.current_price||0),ext=price*Number(x.orderQty||0);
      vendorTotal+=ext;grand+=ext;if(x.orderQty>0)lineCount++;
      const tr=document.createElement('tr');
      tr.innerHTML=`<td>${esc(x.item.item_description)}</td><td>${esc(x.vi.vendor_part_number||x.vi.sku||'—')}</td><td>${esc(x.count.quantity_on_hand)}</td><td>${esc(x.item.minimum_quantity??'—')}</td><td>${esc(x.item.maximum_quantity??'—')}</td><td>${esc(x.count.suggested_order_quantity??0)}</td><td></td><td>${money(price)}</td><td>${money(ext)}</td>`;
      const input=document.createElement('input');input.type='number';input.inputMode='numeric';input.min='0';input.step='1';input.value=x.orderQty;
      input.onchange=()=>{x.orderQty=Math.max(0,Number(input.value||0));renderOrderReview()};
      tr.children[6].appendChild(input);body.appendChild(tr);
    });
    table.appendChild(body);card.appendChild(table);
    const total=document.createElement('div');total.className='order-total';total.textContent=`Supplier total: ${money(vendorTotal)}`;card.appendChild(total);host.appendChild(card);
  });
  $('#orderMeta').textContent=`Using ${sourceLabel} · ${lineCount} order line${lineCount===1?'':'s'} · Estimated total ${money(grand)}`;
  $('#generateOrderBtn').classList.toggle('hidden',lineCount===0);
}
$('#refreshOrderBtn').onclick=refreshOrderReview;
$('#generateOrderBtn').onclick=async()=>{
  const rows=[...orderDraft.values()].filter(x=>Number(x.orderQty)>0);
  if(!rows.length)return;
  const total=rows.reduce((s,x)=>s+Number(x.orderQty)*Number(x.vi.current_price||0),0);
  if(!confirm(`Generate an order snapshot with ${rows.length} line${rows.length===1?'':'s'} totaling ${money(total)}?`))return;
  const orderId=crypto.randomUUID();
  const order={order_id:orderId,order_date:new Date().toISOString().slice(0,10),status:'draft',estimated_total:total,notes:`Generated from inventory session ${orderSession.inventory_session_id}`};
  const {error}=await db.from('cutroom_orders').insert(order);
  if(error){alert(error.message);return}
  const lines=rows.map(x=>({
    order_line_id:crypto.randomUUID(),
    order_id:orderId,
    vendor_item_id:x.vi.vendor_item_id,
    quantity_on_hand_snapshot:Number(x.count.quantity_on_hand||0),
    quantity_ordered:Number(x.orderQty),
    unit_price_snapshot:Number(x.vi.current_price||0),
    notes:null
  }));
  const {error:lineError}=await db.from('cutroom_order_lines').insert(lines);
  if(lineError){
    await db.from('cutroom_orders').delete().eq('order_id',orderId);
    alert(lineError.message);return;
  }
  alert(`Order snapshot generated successfully.\n\n${rows.length} lines · ${money(total)}\n\nOpen Order History to view or print it.`);
};


let historyOrders=[],historyLines=[],historyVendorItems=[],historyItems=[],historyVendors=[],selectedHistoryId=null;
function fmtDate(v){if(!v)return '—';const d=new Date(v);return Number.isNaN(d.getTime())?String(v):d.toLocaleDateString()}
async function loadAllRows(table,select='*'){
 const result=[];for(let start=0;start<10000;start+=750){
  const {data,error}=await db.from(table).select(select).range(start,start+749);
  if(error)throw error;result.push(...(data||[]));if(!data||data.length<750)break;
 }return result;
}
async function loadOrderHistory(){
 $('#historyMessage').textContent='Loading generated orders…';
 $('#historyList').innerHTML='';$('#historyDetail').innerHTML='';
 $('#printHistoryBtn').classList.add('hidden');
 try{
  historyOrders=await loadAllRows('cutroom_orders');
  historyOrders.sort((a,b)=>String(b.order_date||b.created_at||'').localeCompare(String(a.order_date||a.created_at||'')));
  // Include inactive historical records so retired supplies can still be identified.
  [historyLines,historyVendorItems,historyItems,historyVendors]=await Promise.all([
   loadAllRows('cutroom_order_lines'),loadAllRows('cutroom_vendor_items'),
   loadAllRows('cutroom_supply_items'),loadAllRows('cutroom_vendors')]);
  $('#historyMessage').textContent=historyOrders.length?`${historyOrders.length} generated order${historyOrders.length===1?'':'s'}`:'No generated orders yet.';
  renderHistoryList();
  if(historyOrders.length)showHistoryOrder(historyOrders.some(o=>o.order_id===selectedHistoryId)?selectedHistoryId:historyOrders[0].order_id);
 }catch(e){$('#historyMessage').textContent='Could not load order history: '+(e.message||e)}
}
function historyOrderLines(orderId){return historyLines.filter(l=>l.order_id===orderId)}
function historyAmount(lines){return lines.reduce((sum,l)=>sum+Number(l.extended_cost??(Number(l.quantity_ordered||0)*Number(l.unit_price_snapshot||0))),0)}
function renderHistoryList(){
 const el=$('#historyList');el.innerHTML='';
 historyOrders.forEach(o=>{
  const lines=historyOrderLines(o.order_id),btn=document.createElement('button');
  btn.className='history-entry'+(o.order_id===selectedHistoryId?' selected':'');
  const amount=historyAmount(lines);
  btn.innerHTML=`<strong>${esc(fmtDate(o.order_date||o.created_at))}</strong><span>${esc(o.status||'draft')} · ${lines.length} lines</span><strong>${money(lines.length?amount:o.estimated_total)}</strong>`;
  btn.onclick=()=>showHistoryOrder(o.order_id);el.appendChild(btn);
 });
}
function showHistoryOrder(id){
 selectedHistoryId=id;const o=historyOrders.find(x=>x.order_id===id);if(!o)return;
 renderHistoryList();$('#printHistoryBtn').classList.remove('hidden');
 const lines=historyOrderLines(id),byVendor=new Map();
 for(const l of lines){
  const vi=historyVendorItems.find(v=>v.vendor_item_id===l.vendor_item_id);
  const item=historyItems.find(i=>i.supply_item_id===vi?.supply_item_id);
  const vendor=historyVendors.find(v=>v.vendor_id===vi?.vendor_id);
  const name=vendor?.vendor_name||'Unknown supplier';
  if(!byVendor.has(name))byVendor.set(name,[]);
  byVendor.get(name).push({line:l,vi,item});
 }
 const total=historyAmount(lines),host=$('#historyDetail');host.innerHTML='';
 const heading=document.createElement('div');heading.className='card history-heading';
 heading.innerHTML=`<h2>Generated Order — ${esc(fmtDate(o.order_date||o.created_at))}</h2><div>Status: <strong>${esc(o.status||'draft')}</strong> · ${lines.length} lines · <strong>${money(lines.length?total:o.estimated_total)}</strong></div><div class="muted">Order ID: ${esc(o.order_id)}</div>${o.notes?`<div class="muted">${esc(o.notes)}</div>`:''}`;
 host.appendChild(heading);
 [...byVendor.entries()].sort((a,b)=>a[0].localeCompare(b[0])).forEach(([name,entries])=>{
  const card=document.createElement('section');card.className='card history-vendor';
  const subtotal=historyAmount(entries.map(x=>x.line));
  const h=document.createElement('h3');h.textContent=name;card.appendChild(h);
  const wrap=document.createElement('div');wrap.className='history-table-wrap';
  const table=document.createElement('table');table.className='order-table';
  table.innerHTML='<thead><tr><th>Description</th><th>SKU</th><th>Vendor Part / BB#</th><th>On Hand</th><th>Order Qty</th><th>Unit Price</th><th>Extended</th></tr></thead>';
  const body=document.createElement('tbody');
  entries.forEach(({line:l,vi,item})=>{
   const tr=document.createElement('tr');
   const vals=[item?.item_description||vi?.supply_item_id||l.vendor_item_id,vi?.sku||'—',vi?.vendor_part_number||'—',l.quantity_on_hand_snapshot??'—',l.quantity_ordered??'—',money(l.unit_price_snapshot),money(l.extended_cost??(Number(l.quantity_ordered||0)*Number(l.unit_price_snapshot||0)))];
   vals.forEach(v=>{const td=document.createElement('td');td.textContent=String(v);tr.appendChild(td)});body.appendChild(tr);
  });table.appendChild(body);wrap.appendChild(table);card.appendChild(wrap);
  const foot=document.createElement('div');foot.className='order-total';foot.textContent='Supplier subtotal: '+money(subtotal);card.appendChild(foot);host.appendChild(card);
 });
 if(!lines.length){const p=document.createElement('p');p.textContent='No order lines found for this order.';host.appendChild(p)}
}
$('#reloadHistoryBtn').onclick=loadOrderHistory;
$('#printHistoryBtn').onclick=()=>window.print();

window.addEventListener('beforeunload',e=>{if(pending.size||saving.size){e.preventDefault();e.returnValue=''}});
boot();

if('serviceWorker' in navigator){navigator.serviceWorker.register('./service-worker.js').catch(()=>{});}
