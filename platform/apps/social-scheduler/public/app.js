'use strict';
const $ = (s) => document.querySelector(s);
const api = (u, o) => fetch(u, o).then(r => r.json());
const state = { upload: null, platforms: 'both', cfg: {} };

function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function fmtWhen(iso){ if(!iso) return ''; const d=new Date(iso); return isNaN(d)?iso:d.toLocaleString('sq'); }

async function init(){
  try{ state.cfg = await api('/api/scheduler/config'); }catch(e){}
  const c=state.cfg;
  $('#cfgpill').textContent = (c.metaReady?'Meta ✓':'Meta ✗') + ' · ' + (c.publicBaseHttps?'HTTPS ✓':'PUBLIC_BASE_URL ✗');
  // upload
  $('#drop').onclick=()=>$('#file').click();
  $('#drop').ondragover=e=>{e.preventDefault();};
  $('#drop').ondrop=e=>{e.preventDefault(); if(e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);};
  $('#file').onchange=e=>{ if(e.target.files[0]) handleFile(e.target.files[0]); };
  // platforms
  document.querySelectorAll('#plat button').forEach(b=>b.onclick=()=>{ document.querySelectorAll('#plat button').forEach(x=>x.classList.remove('on')); b.classList.add('on'); state.platforms=b.dataset.p; });
  $('#gen').onclick=genCaptions;
  $('#saveDraft').onclick=()=>save('draft');
  $('#schedule').onclick=doSchedule;
  $('#dry').onclick=dryRunForm;
  $('#preflightBtn').onclick=preflight;
  document.querySelectorAll('.tabs button[data-tab]').forEach(b=>b.onclick=()=>{ document.querySelectorAll('.tabs button[data-tab]').forEach(x=>x.classList.remove('on')); b.classList.add('on'); showTab(b.dataset.tab); });
  $('#modalNo').onclick=()=>$('#modal').classList.remove('open');
  loadPosts();
}

function handleFile(f){
  const okTypes=['image/jpeg','image/png','image/webp'];
  if(!okTypes.includes(f.type)){ $('#upstat').innerHTML='<span class="warn">Lloji i lejuar: jpg, png, webp</span>'; return; }
  if(f.size>12*1024*1024){ $('#upstat').innerHTML='<span class="warn">Foto shumë e madhe (max 12MB)</span>'; return; }
  const fr=new FileReader();
  fr.onload=async()=>{
    $('#prev').src=fr.result; $('#prev').style.display='block'; $('#upstat').textContent='Po ngarkohet…';
    try{
      const r=await api('/api/scheduler/upload',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({dataUrl:fr.result,filename:f.name})});
      if(r.error){ $('#upstat').innerHTML='<span class="warn">'+esc(r.error)+'</span>'; return; }
      state.upload=r; $('#upstat').innerHTML='<span class="ok">U ngarkua ✓ '+esc(r.publicPath)+'</span>';
    }catch(e){ $('#upstat').innerHTML='<span class="warn">Gabim ngarkimi</span>'; }
  };
  fr.readAsDataURL(f);
}

function formFields(){ return { product_name:$('#f_name').value, price:$('#f_price').value, discount:$('#f_disc').value, campaign:$('#f_camp').value, link:$('#f_link').value, notes:$('#f_notes').value }; }

async function genCaptions(){
  const b=$('#gen'), t=b.textContent; b.disabled=true; b.textContent='Po gjenerohet…';
  try{
    const r=await api('/api/scheduler/captions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.assign(formFields(),{platforms:state.platforms}))});
    const c=r.copy||{}; $('#cFb').value=c.facebook||''; $('#cIg').value=c.instagram||''; $('#cTags').value=c.hashtags||''; $('#cDesc').value=c.description||'';
  }catch(e){ alert('Gabim: '+e); } finally{ b.disabled=false; b.textContent=t; }
}

function payload(status){
  return Object.assign(formFields(), {
    status, platforms:state.platforms,
    image_path: state.upload?state.upload.publicPath:'', image_filename: state.upload?state.upload.filename:'',
    facebook_caption:$('#cFb').value, instagram_caption:$('#cIg').value, hashtags:$('#cTags').value, meta_description:$('#cDesc').value,
    scheduled_at: $('#when').value ? new Date($('#when').value).toISOString() : null,
  });
}

let lastCreatedId=null;
async function save(status){
  if(!state.upload){ $('#formstat').innerHTML='<span class="warn">Ngarko një foto së pari.</span>'; return; }
  const r=await api('/api/scheduler/posts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload(status))});
  if(r.error){ $('#formstat').innerHTML='<span class="warn">'+esc(r.error)+'</span>'; return null; }
  lastCreatedId=r.post.id; $('#formstat').innerHTML='<span class="ok">U ruajt ('+status+').</span>'; loadPosts(); return r.post;
}

async function doSchedule(){
  if(!state.upload){ $('#formstat').innerHTML='<span class="warn">Ngarko një foto së pari.</span>'; return; }
  if(!$('#when').value){ $('#formstat').innerHTML='<span class="warn">Zgjidh datën dhe orën.</span>'; return; }
  const when=new Date($('#when').value);
  const now=Date.now();
  const isNow = when.getTime()<=now+60000;
  confirmModal('Konfirmo planifikimin', 'Posti do publikohet '+(isNow?'TANI (në ciklin tjetër të worker-it)':('më '+when.toLocaleString('sq')))+' në <b>'+labelPlat(state.platforms)+'</b>.<br>Mund ta anulosh ose editosh para kohës.', async()=>{
    const post=await save('draft'); if(!post) return;
    const r=await api('/api/scheduler/posts/'+post.id+'/schedule',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({scheduled_at:when.toISOString()})});
    if(r.error){ $('#formstat').innerHTML='<span class="warn">'+esc(r.error)+'</span>'; return; }
    $('#formstat').innerHTML='<span class="ok">U planifikua ✓</span>'; loadPosts();
  });
}

function labelPlat(p){ return p==='both'?'Facebook + Instagram':(p==='facebook'?'Facebook':'Instagram'); }

async function dryRunForm(){
  const post=await save('draft'); if(!post) return;
  const d=await api('/api/scheduler/posts/'+post.id+'/dryrun',{method:'POST'});
  showModal('<h2>Dry-run — Meta</h2><pre>'+esc(JSON.stringify(d,null,2))+'</pre>');
}

async function loadPosts(){
  const r=await api('/api/scheduler/posts'); state.posts=r.posts||[]; renderList(); renderCal();
}
function postCard(p){
  const cap=(p.facebook_caption||p.instagram_caption||'').split('\n')[0];
  let acts='';
  if(p.status==='scheduled'||p.status==='draft') acts+='<button data-act="cancel" data-id="'+p.id+'">Anulo</button>';
  if(p.status==='failed') acts+='<button data-act="retry" data-id="'+p.id+'">↻ Riprovo</button>';
  acts+='<button data-act="dry" data-id="'+p.id+'">Dry-run</button>';
  return '<div class="post"><img src="'+esc(p.image_path||'')+'" onerror="this.style.visibility=\'hidden\'"><div class="body">'
    +'<div><span class="status s-'+p.status+'">'+p.status+'</span> <small style="color:#8b97a6">'+ (p.scheduled_at?('· '+fmtWhen(p.scheduled_at)):'') +'</small></div>'
    +'<div style="font-weight:600;margin:4px 0">'+esc(p.meta&&p.meta.product_name||p.meta&&p.meta.campaign||'Postim')+' · '+labelPlat(p.platforms)+'</div>'
    +'<div class="cap">'+esc(cap)+'</div>'
    + (p.error_message?'<div class="warn">'+esc(p.error_message)+'</div>':'')
    + (p.facebook_post_id||p.instagram_media_id?'<div class="ok">FB:'+esc(p.facebook_post_id||'-')+' IG:'+esc(p.instagram_media_id||'-')+'</div>':'')
    +'<div class="acts">'+acts+'</div></div></div>';
}
function renderList(){
  const w=$('#listWrap');
  if(!state.posts.length){ w.innerHTML='<div class="hint">Asnjë postim ende.</div>'; return; }
  w.innerHTML=state.posts.map(postCard).join('');
  w.querySelectorAll('button[data-act]').forEach(b=>b.onclick=()=>act(b.dataset.act,b.dataset.id));
}
function renderCal(){
  const w=$('#calWrap'); const byDay={};
  state.posts.filter(p=>p.scheduled_at).forEach(p=>{ const d=new Date(p.scheduled_at).toLocaleDateString('sq'); (byDay[d]=byDay[d]||[]).push(p); });
  const days=Object.keys(byDay).sort();
  w.innerHTML = days.length? days.map(d=>'<div style="margin-bottom:10px"><div style="font-weight:700;color:#9aa6b2;margin-bottom:6px">'+esc(d)+'</div>'+byDay[d].map(postCard).join('')+'</div>').join('') : '<div class="hint">Asnjë postim i planifikuar.</div>';
  w.querySelectorAll('button[data-act]').forEach(b=>b.onclick=()=>act(b.dataset.act,b.dataset.id));
}
async function showTab(t){
  $('#listWrap').style.display=t==='list'?'block':'none';
  $('#calWrap').style.display=t==='cal'?'block':'none';
  $('#histWrap').style.display=t==='hist'?'block':'none';
  if(t==='hist'){ const r=await api('/api/scheduler/history'); $('#histWrap').innerHTML = (r.history&&r.history.length)? '<pre>'+esc(JSON.stringify(r.history,null,2))+'</pre>' : '<div class="hint">Pa histori publikimi ende.</div>'; }
}
async function act(a,id){
  if(a==='cancel'){ if(!confirm('Anulo këtë postim?'))return; const r=await api('/api/scheduler/posts/'+id+'/cancel',{method:'POST'}); if(r.error)alert(r.error); loadPosts(); }
  else if(a==='retry'){ const r=await api('/api/scheduler/posts/'+id+'/retry',{method:'POST'}); if(r.error)alert(r.error); loadPosts(); }
  else if(a==='dry'){ const d=await api('/api/scheduler/posts/'+id+'/dryrun',{method:'POST'}); showModal('<h2>Dry-run — Meta</h2><pre>'+esc(JSON.stringify(d,null,2))+'</pre>'); }
}
async function preflight(){ const d=await api('/api/scheduler/preflight'); showModal('<h2>Meta preflight</h2><pre>'+esc(JSON.stringify(d,null,2))+'</pre>'); }

function showModal(html){ $('#modalBody').innerHTML=html; $('#modalYes').style.display='none'; $('#modal').classList.add('open'); }
function confirmModal(title,html,onYes){ $('#modalBody').innerHTML='<h2>'+esc(title)+'</h2><p style="color:#cdd5de;font-size:14px">'+html+'</p>'; const y=$('#modalYes'); y.style.display='inline-block'; y.onclick=()=>{ $('#modal').classList.remove('open'); onYes(); }; $('#modal').classList.add('open'); }

init();
