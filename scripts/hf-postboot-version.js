(function(){
  function enforce(){
    try{
      if(window.HF?.rebalanceCherryDemand)window.HF.rebalanceCherryDemand();
      if(window.HF?.hfV130)try{window.HF.save(false)}catch(_){}
      const build=window.hfCurrentBuildVersion?.()||window.HF_BUILD_VERSION||'1.1.38';
      window.__HF_BUILD__=build;
      document.documentElement.dataset.hfVersion=build;
      if(document.body)document.body.dataset.hfBuild=build;
    }catch(err){console.error('HF 1.1.29 postboot demand repair',err)}
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
  function reinforce(){enforce();ensureSaveTools()}
  reinforce();setTimeout(reinforce,120);setTimeout(reinforce,700);setTimeout(reinforce,1800);
})();
