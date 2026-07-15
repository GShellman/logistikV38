(function(){
  function enforce(){
    try{
      if(window.HF?.rebalanceCherryDemand)window.HF.rebalanceCherryDemand();
      if(window.HF?.hfV130)try{window.HF.save(false)}catch(_){}
      window.__HF_BUILD__='1.1.38';
      document.documentElement.dataset.hfVersion='1.1.38';
      if(document.body)document.body.dataset.hfBuild='1.1.38';
    }catch(err){console.error('HF 1.1.29 postboot demand repair',err)}
  }
  function depotBuildAction(){
    return 'window.HF.hfPostbootOpenDepotBuild()';
  }
  function depotFeatureStatusMarkup(){
    if(window.HF?.hfOpenDepotBuild)return '';
    const detail=window.__HF_DEPOT_MODULE_ERROR__?` · ${String(window.__HF_DEPOT_MODULE_ERROR__).slice(0,140)}`:'';
    return `<div class="compact-note" style="margin:10px 0">Depot-Funktionen werden geladen. Falls der Button noch nicht reagiert, bitte die Ansicht erneut öffnen${detail}.</div>`;
  }
  function depotRowsMarkup(){
    const depots=Array.isArray(state?.depots)?state.depots:[];
    if(!depots.length)return `${depotFeatureStatusMarkup()}<div class="empty"><div class="big">🏬</div>Noch kein Depot gebaut. Depots automatisieren die letzte Meile, benötigen aber regelmäßige Warenzufuhr.</div>`;
    return `<div class="list">${depots.map(d=>`<div class="list-item hf-depot-card"><div class="hf-depot-icon">🏬</div><div><div class="row"><div><b>${d.name||'Verteildepot'}</b><div class="sub">${(d.cities||[]).length} Städte · ${(d.goods||[]).length} Waren · ${Object.values(d.fleet||{}).reduce((n,x)=>n+(Number(x)||0),0)} Fahrzeuge</div></div><span class="pill ${d.active!==false?'live':'locked'}">${d.active!==false?'AUTO':'PAUSE'}</span></div><div class="sub" style="margin-top:6px">${d.lastStatus||'Bereit'}</div><div class="fleet-actions"><button class="btn sm primary" onclick="window.HF.hfOpenDepot('${d.id}')">📅 Disponieren</button><button class="btn sm secondary" onclick="window.HF.hfOpenDepotSupply('${d.id}')">📦 Direkt beliefern</button></div></div></div>`).join('')}</div>`;
  }
  function injectDepotMenu(root){
    if(!root)return false;
    const existing=root.querySelector('#hfDepotMenuFallback,[data-hf-depot-menu]');
    if(existing)return false;
    root.insertAdjacentHTML('beforeend',`<section class="card" id="hfDepotMenuFallback" data-hf-depot-menu="1"><div class="row"><div><h2 style="margin:0">Depots & Nahverteilung</h2><div class="sub">Depots versorgen ausgewählte Städte automatisch mit deren Tagesbedarf.</div></div><button class="btn sm primary" onclick="${depotBuildAction()}">+ Depot</button></div><div class="compact-note" style="margin:10px 0">Deine Aufgabe verschiebt sich zur Warenversorgung der Depots. Depotfahrzeuge disponieren die letzte Meile selbstständig.</div>${depotRowsMarkup()}</section>`);
    return true;
  }

  function ensureLogisticsDepotQuickAction(){
    try{
      const root=document.getElementById('content');
      if(root?.dataset?.tab!=='logistics')return;
      const actions=root.querySelector('.quick-actions');
      if(!actions||actions.querySelector('[data-hf-depot-quick-action]'))return;
      actions.insertAdjacentHTML('beforeend',`<button class="btn secondary" data-hf-depot-quick-action="1" onclick="${depotBuildAction()}">🏬 Depot</button>`);
    }catch(err){console.error('Depot-Schnellaktion konnte nicht ergänzt werden',err)}
  }
  function injectCurrentDepotMenu(){
    try{
      const root=document.getElementById('content');
      if(root?.dataset?.tab==='logistics'){ensureLogisticsDepotQuickAction();injectDepotMenu(root)}
    }catch(err){console.error('Depot-Menü konnte nicht direkt ergänzt werden',err)}
  }
  function depotMenuCardMarkup(){
    try{
      if(typeof renderLogistics!=='function')return;
      if(!renderLogistics.__hfDepotMenuGuard){
        const baseRenderLogistics=renderLogistics;
        renderLogistics=function(root){
          const result=baseRenderLogistics(root);
          try{ensureLogisticsDepotQuickAction();injectDepotMenu(root)}catch(err){console.error('Depot-Menü konnte nicht ergänzt werden',err)}
          return result;
        };
        renderLogistics.__hfDepotMenuGuard=true;
      }
      injectCurrentDepotMenu();
      const content=document.getElementById('content');
      if(content?.dataset?.tab==='logistics'&&typeof renderAll==='function')requestAnimationFrame(()=>{renderAll();setTimeout(injectCurrentDepotMenu,0)});
    }catch(err){console.error('HF Depot menu guard',err)}
  }
  function postbootOpenDepotBuild(){
    try{
      if(window.HF?.hfOpenDepotBuild)return window.HF.hfOpenDepotBuild();
      ensureDepotModule();
      setTimeout(()=>{if(window.HF?.hfOpenDepotBuild)window.HF.hfOpenDepotBuild();else if(typeof toast==='function')toast('Depot-Modul ist noch nicht verfügbar. Logistik neu öffnen oder Spiel neu laden.','bad')},160);
    }catch(err){console.error('Depot-Aufruf fehlgeschlagen',err);try{toast('Depot konnte nicht geöffnet werden.','bad')}catch(_){}}
  }
  function ensureDepotModule(){
    try{
      if(window.HF?.hfOpenDepotBuild||document.querySelector('script[data-hf-depot-module-fallback]'))return;
      const script=document.createElement('script');
      script.src='scripts/hf-depot-extensions.js';
      script.dataset.hfDepotModuleFallback='1';
      script.onload=()=>{depotMenuCardMarkup();try{if(typeof renderAll==='function')renderAll()}catch(_){ }setTimeout(injectCurrentDepotMenu,0)};
      script.onerror=err=>console.error('Depot feature module konnte nicht nachgeladen werden',err);
      document.head.appendChild(script);
    }catch(err){console.error('Depot feature module fallback',err)}
  }
  function uiAction(name){return function(){try{const fn=window.HF&&window.HF[name];if(typeof fn==='function')fn();else console.warn('Spielstand-Aktion nicht verfügbar',name)}catch(err){console.warn('Spielstand-Aktion fehlgeschlagen',name,err)}}}
  function ensureSaveTools(){
    try{
      let wrap=document.getElementById('hfSaveTools');
      if(!wrap){
        wrap=document.createElement('div');wrap.id='hfSaveTools';wrap.className='hf-save-tools';
        wrap.innerHTML='<button type="button" class="hf-save-tool" id="hfQuickSave">💾 Speichern</button><button type="button" class="hf-save-tool primary" id="hfQuickExport">⬇ Export</button><button type="button" class="hf-save-tool orange" id="hfQuickImport">⬆ Import</button>';
        document.body.appendChild(wrap);
      }
      Object.assign(wrap.style,{display:'flex',visibility:'visible',opacity:'1',zIndex:'2147482500',pointerEvents:'auto'});
      for(const [id,name] of [['hfQuickSave','save'],['hfQuickExport','exportSave'],['hfQuickImport','importSave']]){
        const btn=document.getElementById(id);
        if(btn&&!btn.dataset.hfPostbootBound){btn.dataset.hfPostbootBound='1';btn.addEventListener('click',uiAction(name));}
      }
      const actions=document.querySelector('#hfTitleScreen .hf-title-actions');
      if(actions&&!document.getElementById('hfTitleImport')){
        const exportBtn=document.createElement('button'),importBtn=document.createElement('button');
        exportBtn.type='button';exportBtn.id='hfTitleExport';exportBtn.className='hf-title-btn secondary';exportBtn.innerHTML='<span>⬇</span> Spielstand exportieren';
        importBtn.type='button';importBtn.id='hfTitleImport';importBtn.className='hf-title-btn secondary';importBtn.innerHTML='<span>⬆</span> Spielstand importieren';
        exportBtn.addEventListener('click',uiAction('exportSave'));importBtn.addEventListener('click',uiAction('importSave'));actions.append(exportBtn,importBtn);
      }
    }catch(err){console.error('Save-/Export-/Import-Werkzeuge konnten nicht gesichert werden',err)}
  }
  function reinforce(){enforce();window.HF={...window.HF,hfPostbootOpenDepotBuild:postbootOpenDepotBuild};ensureDepotModule();depotMenuCardMarkup();ensureSaveTools()}
  reinforce();setTimeout(reinforce,120);setTimeout(reinforce,700);setTimeout(reinforce,1800);
})();
