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
  enforce();setTimeout(enforce,120);setTimeout(enforce,700);
})();
