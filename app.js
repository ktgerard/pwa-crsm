
const cfg=window.CUTROOM_CONFIG;
const db=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseKey);
const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
let items=[], vendors=[], groups=[], vendorItems=[], currentVendor='All', currentSession=null, counts=new Map();

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
function queueSave(i,input){if(!currentSession){alert('Start a new count first.');input.value='';return}const badge=input.closest('.count-row').querySelector('.save-state');if(input.value===''){badge.textContent='';return}const q=Number(input.value);if(!Number.isFinite(q)||q<0){badge.textContent='Invalid';badge.className='save-state save-error';return}badge.textContent='Saving…';badge.className='save-state saving-badge';clearTimeout(timers.get(i.supply_item_id));timers.set(i.supply_item_id,setTimeout(()=>saveCount(i,input,badge),300))}
async function saveCount(i,input,badge){const q=Number(input.value);if(!Number.isFinite(q)||q<0)return;const payload={inventory_session_id:currentSession.inventory_session_id,supply_item_id:i.supply_item_id,quantity_on_hand:q,suggested_order_quantity:suggestion(i,q)??0};const {data,error}=await db.from('cutroom_inventory_counts').upsert(payload,{onConflict:'inventory_session_id,supply_item_id'}).select().single();if(error){badge.textContent='Save failed';badge.className='save-state save-error';return}counts.set(i.supply_item_id,data);badge.textContent='Saved';badge.className='save-state saved-badge';updateProgress()}
function updateProgress(){const monthly=countableItems();$('#sessionMeta').textContent=currentSession?`${counts.size?`${counts.size} of ${monthly.length} items saved`:'Empty draft'} · Started ${new Date(currentSession.created_at).toLocaleString()}`:'Start a count to enter quantities.';groups.filter(g=>g.count_monthly_flag).forEach(g=>{const list=monthly.filter(i=>i.presentation_group_id===g.presentation_group_id),el=document.querySelector(`[data-progress="${g.presentation_group_id}"]`);if(el)el.textContent=`${list.filter(i=>counts.has(i.supply_item_id)).length} of ${list.length} counted`})}
function renderCount(){const monthly=countableItems();$('#sessionTitle').textContent=currentSession?(counts.size?'Monthly Count — Draft':'Monthly Count — Empty Draft'):'No active count';$('#sessionMeta').textContent=currentSession?`${counts.size?`${counts.size} of ${monthly.length} items saved`:'Empty draft'} · Started ${new Date(currentSession.created_at).toLocaleString()}`:'Start a count to enter quantities.';$('#newCountBtn').textContent=currentSession?'Resume Draft Count':'Start New Count';$('#discardCountBtn').classList.toggle('hidden',!currentSession);$('#completeCountBtn').classList.toggle('hidden',!currentSession);$('#countGroups').innerHTML=groups.filter(g=>g.count_monthly_flag).map(g=>{const list=monthly.filter(i=>i.presentation_group_id===g.presentation_group_id).sort((a,b)=>(a.presentation_sort_order??9999)-(b.presentation_sort_order??9999));const done=list.filter(i=>counts.has(i.supply_item_id)).length;return `<details class="group" open><summary><span>${esc(g.group_name)}</span><span data-progress="${g.presentation_group_id}">${done} of ${list.length} counted</span></summary>${list.map(i=>{const c=counts.get(i.supply_item_id),q=c?.quantity_on_hand??'',sg=q===''?null:suggestion(i,q);return `<div class="count-row ${sg>0?'order-needed':''}"><div><div class="item-name">${esc(i.item_description)}</div><div class="sub">${esc(vendorName(viFor(i.supply_item_id)?.vendor_id)||'')}</div><span class="save-state ${c?'saved-badge':''}">${c?'Saved':''}</span></div><div><span class="sub">Min</span><br>${esc(i.minimum_quantity??'—')}</div><div><span class="sub">Max</span><br>${esc(i.maximum_quantity??'—')}</div><div><input inputmode="decimal" type="number" min="0" step="any" value="${esc(q)}" data-id="${i.supply_item_id}" placeholder="Qty"></div><div><span class="sub">Suggested order</span><br><span class="suggest">${sg==null?'—':sg}</span></div></div>`}).join('')}</details>`}).join('');$$('#countGroups input').forEach(inp=>{const item=items.find(i=>i.supply_item_id===inp.dataset.id);inp.oninput=()=>{const sg=suggestion(item,inp.value),row=inp.closest('.count-row');row.querySelector('.suggest').textContent=sg==null?'—':sg;row.classList.toggle('order-needed',sg>0);queueSave(item,inp)}})}
$('#completeCountBtn').onclick=async()=>{await new Promise(r=>setTimeout(r,450));const monthly=countableItems();if(counts.size<monthly.length&&!confirm(`Only ${counts.size} of ${monthly.length} monthly items have been saved. Complete anyway?`))return;const {error}=await db.from('cutroom_inventory_sessions').update({status:'completed',completed_at:new Date().toISOString()}).eq('inventory_session_id',currentSession.inventory_session_id);if(error){alert(error.message);return}alert('Monthly count completed.');currentSession=null;counts.clear();renderCount()};

boot();

if('serviceWorker' in navigator){navigator.serviceWorker.register('./service-worker.js').catch(()=>{});}
