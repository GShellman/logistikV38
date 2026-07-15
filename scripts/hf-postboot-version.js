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
  function depotMenuCardMarkup(){
    try{
      if(!window.HF?.hfOpenDepotBuild||typeof renderLogistics!=='function'||renderLogistics.__hfDepotMenuGuard)return;
      const baseRenderLogistics=renderLogistics;
      renderLogistics=function(root){
        const result=baseRenderLogistics(root);
        try{
          const depots=Array.isArray(state?.depots)?state.depots:[];
          if(root.querySelector('.hf-depot-card,#hfDepotMenuFallback'))return result;
          const depotRows=depots.length?`<div class="list">${depots.map(d=>`<div class="list-item hf-depot-card"><div class="hf-depot-icon">🏬</div><div><div class="row"><div><b>${d.name||'Verteildepot'}</b><div class="sub">${(d.cities||[]).length} Städte · ${(d.goods||[]).length} Waren · ${Object.values(d.fleet||{}).reduce((n,x)=>n+(Number(x)||0),0)} Fahrzeuge</div></div><span class="pill ${d.active!==false?'live':'locked'}">${d.active!==false?'AUTO':'PAUSE'}</span></div><div class="sub" style="margin-top:6px">${d.lastStatus||'Bereit'}</div><div class="fleet-actions"><button class="btn sm primary" onclick="window.HF.hfOpenDepot('${d.id}')">📅 Disponieren</button><button class="btn sm secondary" onclick="window.HF.hfOpenDepotSupply('${d.id}')">📦 Direkt beliefern</button></div></div></div>`).join('')}</div>`:'<div class="empty"><div class="big">🏬</div>Noch kein Depot gebaut. Depots automatisieren die letzte Meile, benötigen aber regelmäßige Warenzufuhr.</div>';
          root.insertAdjacentHTML('beforeend',`<section class="card" id="hfDepotMenuFallback"><div class="row"><div><h2 style="margin:0">Depots & Nahverteilung</h2><div class="sub">Depots versorgen ausgewählte Städte automatisch mit deren Tagesbedarf.</div></div><button class="btn sm primary" onclick="window.HF.hfOpenDepotBuild()">+ Depot</button></div><div class="compact-note" style="margin:10px 0">Deine Aufgabe verschiebt sich zur Warenversorgung der Depots. Depotfahrzeuge disponieren die letzte Meile selbstständig.</div>${depotRows}</section>`);
        }catch(err){console.error('Depot-Menü konnte nicht ergänzt werden',err)}
        return result;
      };
      renderLogistics.__hfDepotMenuGuard=true;
    }catch(err){console.error('HF Depot menu guard',err)}
  }

  enforce();depotMenuCardMarkup();setTimeout(enforce,120);setTimeout(enforce,700);setTimeout(depotMenuCardMarkup,120);setTimeout(depotMenuCardMarkup,700);
})();
