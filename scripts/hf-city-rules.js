// City-specific rules for Helvetic Freight.
// Keep catalog normalization and location rules outside the HTML shell.
(function(global){
  'use strict';

  function normalizeCityEntry(entry){
    if(Array.isArray(entry)){
      return {id:entry[0],name:entry[1],lat:entry[2],lng:entry[3],tier:entry[4],slots:entry[5],population:entry[6],wealthFactor:entry[7],demandProfile:entry[8]};
    }
    return {
      id:entry.id,
      name:entry.name,
      lat:entry.coordinates?.lat??entry.lat,
      lng:entry.coordinates?.lng??entry.lng,
      tier:entry.tier,
      slots:entry.slots,
      population:entry.population,
      wealthFactor:entry.wealthFactor,
      demandProfile:entry.demandProfile
    };
  }

  function normalizeCatalog(catalog){
    return (catalog||[]).map(normalizeCityEntry);
  }


  const LAKE_TOWN_IDS = ['zurich','thun','interlaken','spiez','biel','neuchatel','yverdon','lausanne','montreux','vevey','geneva','nyon','gland','morges','luzern','zug','stans','fluelen','rapperswil','uster','horgen','pfaffikon','lachen','kreuzlingen','romanshorn','locarno','lugano','chiasso'];

  function cityIds(cities){
    return (cities||[]).map(city=>city.id);
  }

  function cityIdsByMinimumTier(cities,tier){
    return (cities||[]).filter(city=>city.tier>=tier).map(city=>city.id);
  }

  function allCitiesSet(cities){
    return new Set(cityIds(cities));
  }

  function minimumTierSet(cities,tier){
    return new Set(cityIdsByMinimumTier(cities,tier));
  }

  function lakeTownsSet(){
    return new Set(LAKE_TOWN_IDS);
  }

  const RAW_ALLOWED = {
  farm:new Set(['zurich','winterthur','baden','aarau','olten','basel','liestal','sissach','solothurn','bern','thun','fribourg','biel','yverdon','lausanne','geneva','nyon','luzern','zug','rapperswil','uster','schaffhausen','frauenfeld','kreuzlingen','stgallen','wil','delémont','sursee','emmen','horgen','wetzikon','pfaffikon','lachen','sarnen','romanshorn','weinfelden','bulle','payerne','morges','gland','renens','chiasso']),
  forestry:new Set(['winterthur','baden','aarau','liestal','sissach','solothurn','bern','thun','interlaken','spiez','fribourg','biel','neuchatel','yverdon','montreux','sion','martigny','brig','luzern','schwyz','stans','altdorf','glarus','rapperswil','schaffhausen','stgallen','wil','herisau','appenzell','chur','landquart','davos','stmoritz','bellinzona','locarno','delémont','sarnen','einsiedeln','sargans','badragaz','altstatten','moutier','porrentruy','biasca','airolo','fluelen','arthgoldau','monthey','aigle','sursee']),
  mine:new Set(['thun','interlaken','spiez','sion','martigny','brig','visp','schwyz','stans','altdorf','andermatt','glarus','chur','landquart','davos','stmoritz','bellinzona','locarno','lugano','sargans','biasca','airolo','sierre','moutier','chiasso']),
  chemical:new Set(['basel','liestal','visp','zurich','geneva','lausanne','bern','stgallen','renens','monthey','sargans','chiasso'])
};


  function createLocationSystem(env){
    'use strict';
    const {CITIES,CITY,FACILITIES,RAW_ALLOWED,state,facilityImg,facilityFlowText,money,toast,escAttr,renderAll,save}=env;
    let {openFacility,buildFacility,facilityAllowed}=env;

  const BUILD='1.1.36',SCHEMA=136;
  const unique=list=>[...new Set((list||[]).filter(Boolean))];
  const clone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
  const plain=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  const setOf=value=>value instanceof Set?new Set(value):new Set(Array.isArray(value)?value:[]);

  // Capture the old hard-coded lists once; they become city attributes rather than the rule engine.
  const legacy={
    farmland:setOf(RAW_ALLOWED?.farm),forest:setOf(RAW_ALLOWED?.forestry),fish:setOf(RAW_ALLOWED?.fishery||globalThis.LAKE_TOWNS),
    ore:setOf(RAW_ALLOWED?.mine),chemical:setOf(RAW_ALLOWED?.chemical)
  };
  const orchardIds=new Set([
    'zurich','winterthur','baden','aarau','basel','liestal','sissach','bern','fribourg','biel','neuchatel','yverdon','lausanne','montreux','vevey','geneva','nyon','sion','martigny','luzern','zug','rapperswil','uster','schaffhausen','frauenfeld','kreuzlingen','stgallen','wil','bellinzona','locarno','lugano','mendrisio','sursee','horgen','wetzikon','pfaffikon','lachen','romanshorn','weinfelden','payerne','morges','aigle','sierre','gland','chiasso','monthey','renens'
  ]);
  const aluminumDepositIds=new Set(['thun','spiez','sion','martigny','brig','visp','schwyz','altdorf','andermatt','glarus','chur','landquart','sargans','biasca','airolo','moutier','chiasso']);
  const highAlpineIds=new Set(['andermatt','airolo','davos','stmoritz']);
  const alpineIds=new Set(['thun','interlaken','spiez','sion','martigny','brig','visp','schwyz','stans','altdorf','andermatt','glarus','chur','landquart','davos','stmoritz','sarnen','einsiedeln','arthgoldau','fluelen','airolo','sargans','badragaz','biasca','sierre','monthey','aigle']);
  const juraIds=new Set(['basel','liestal','sissach','solothurn','biel','neuchatel','lachauxdefonds','delémont','moutier','porrentruy']);
  const valleyIds=new Set(['sion','martigny','brig','visp','chur','landquart','bellinzona','locarno','lugano','mendrisio','sargans','badragaz','altstatten','biasca','airolo','sierre','chiasso','monthey']);
  const warmIds=new Set(['geneva','nyon','lausanne','montreux','vevey','sion','martigny','sierre','monthey','aigle','bellinzona','locarno','lugano','mendrisio','chiasso','biasca']);
  const coolIds=new Set(['lachauxdefonds','delémont','moutier','porrentruy','appenzell','herisau','glarus','einsiedeln']);
  const industrial3Ids=new Set(['zurich','winterthur','baden','olten','basel','liestal','bern','biel','lausanne','geneva','luzern','zug','stgallen','chur','lugano','visp','monthey','renens']);
  const energy3Ids=new Set(['basel','sion','brig','visp','altdorf','glarus','chur','biasca','monthey']);
  const energy2Ids=new Set(['zurich','winterthur','baden','olten','bern','thun','biel','lausanne','geneva','luzern','zug','schwyz','stans','andermatt','landquart','bellinzona','locarno','lugano','sargans','sierre','chiasso']);

  const resourceTypes={
    farmland:{id:'farmland',name:'Ackerland',icon:'🌾'},orchard_land:{id:'orchard_land',name:'Obstbauland',icon:'🌳'},forest:{id:'forest',name:'Waldgebiet',icon:'🌲'},freshwater_fish:{id:'freshwater_fish',name:'Fischgewässer',icon:'🐟'},ore_deposit:{id:'ore_deposit',name:'Erzvorkommen',icon:'⛏️'},aluminum_ore_deposit:{id:'aluminum_ore_deposit',name:'Aluminiumerzvorkommen',icon:'🪨'}
  };
  const climates={temperate:{id:'temperate',name:'Gemäßigt'},cool_temperate:{id:'cool_temperate',name:'Kühl-gemäßigt'},warm_temperate:{id:'warm_temperate',name:'Warm-gemäßigt'},alpine:{id:'alpine',name:'Alpin'}};
  const geographyTypes={lowland:{id:'lowland',name:'Mittelland/Tiefland'},lake:{id:'lake',name:'Seegebiet'},valley:{id:'valley',name:'Tal'},jura:{id:'jura',name:'Jura'},alpine:{id:'alpine',name:'Alpenraum'},high_alpine:{id:'high_alpine',name:'Hochalpin'}};

  const locationProfiles={
    universal:{id:'universal',name:'Überall baubar',description:'Keine natürlichen Standortbedingungen.',rules:{}},
    field_crop:{id:'field_crop',name:'Ackerbau',description:'Benötigt geeignetes Ackerland und ist im Hochgebirge nicht möglich.',rules:{requiresAllResources:['farmland'],forbiddenGeography:['high_alpine'],maxPerCity:4}},
    livestock:{id:'livestock',name:'Tierhaltung',description:'Benötigt landwirtschaftlich nutzbare Flächen.',rules:{requiresAllResources:['farmland'],forbiddenGeography:['high_alpine'],maxPerCity:3}},
    greenhouse:{id:'greenhouse',name:'Gewächshaus',description:'Klimatisch flexibel, aber nicht hochalpin.',rules:{forbiddenGeography:['high_alpine'],maxPerCity:4}},
    orchard:{id:'orchard',name:'Obstbau',description:'Benötigt Obstbauland und ein geeignetes Klima.',rules:{requiresAllResources:['orchard_land'],allowedClimates:['temperate','warm_temperate'],forbiddenGeography:['high_alpine'],maxPerCity:3}},
    forest_resource:{id:'forest_resource',name:'Forstwirtschaft',description:'Nur in Städten mit nutzbarem Waldgebiet.',rules:{requiresAllResources:['forest'],maxPerCity:2}},
    fish_resource:{id:'fish_resource',name:'Fischerei',description:'Nur an einem nutzbaren Fischgewässer.',rules:{requiresAllResources:['freshwater_fish'],maxPerCity:2}},
    ore_extraction:{id:'ore_extraction',name:'Erzabbau',description:'Nur an einem ausgewiesenen Erzvorkommen.',rules:{requiresAllResources:['ore_deposit'],maxPerCity:1}},
    aluminum_extraction:{id:'aluminum_extraction',name:'Aluminiumerzabbau',description:'Nur an einem ausgewiesenen Aluminiumerzvorkommen.',rules:{requiresAllResources:['aluminum_ore_deposit'],maxPerCity:1}},
    light_industry:{id:'light_industry',name:'Leichtindustrie',description:'Kann in jeder Stadt mit allgemeinem Industriepotenzial gebaut werden.',rules:{minIndustryPotential:1}},
    medium_industry:{id:'medium_industry',name:'Spezialisierte Industrie',description:'Benötigt erhöhtes Industriepotenzial.',rules:{minIndustryPotential:2}},
    energy_intensive_industry:{id:'energy_intensive_industry',name:'Energieintensive Industrie',description:'Benötigt erhöhtes Industrie- und Energiepotenzial.',rules:{minIndustryPotential:2,minEnergyPotential:2,maxPerCity:2}},
    chemical_industry:{id:'chemical_industry',name:'Chemiecluster',description:'Nur an einem etablierten Chemie- und Prozessindustriestandort.',rules:{requiresAllSpecializations:['chemical_cluster'],minIndustryPotential:2,maxPerCity:2}}
  };

  function cityProfileFor(city){
    const resources=[];if(legacy.farmland.has(city.id))resources.push('farmland');if(orchardIds.has(city.id))resources.push('orchard_land');if(legacy.forest.has(city.id))resources.push('forest');if(legacy.fish.has(city.id))resources.push('freshwater_fish');if(legacy.ore.has(city.id))resources.push('ore_deposit');if(aluminumDepositIds.has(city.id))resources.push('aluminum_ore_deposit');
    const geography=[];if(legacy.fish.has(city.id))geography.push('lake');if(valleyIds.has(city.id))geography.push('valley');if(juraIds.has(city.id))geography.push('jura');if(alpineIds.has(city.id))geography.push('alpine');if(highAlpineIds.has(city.id))geography.push('high_alpine');if(!geography.length)geography.push('lowland');
    const climate=highAlpineIds.has(city.id)||alpineIds.has(city.id)?'alpine':warmIds.has(city.id)?'warm_temperate':coolIds.has(city.id)?'cool_temperate':'temperate';
    const industryPotential=industrial3Ids.has(city.id)?3:Math.max(1,Math.min(3,Number(city.tier)||1));
    const energyPotential=energy3Ids.has(city.id)?3:energy2Ids.has(city.id)?2:Math.max(1,city.tier>=3?2:1);
    const specializations=[];if(legacy.chemical.has(city.id))specializations.push('chemical_cluster');
    return {id:city.id,name:city.name,climate,geography:unique(geography),resources:unique(resources),industryPotential,energyPotential,specializations};
  }
  const cityProfiles=Object.fromEntries(CITIES.map(c=>[c.id,cityProfileFor(c)]));

  const facilityAssignments={
    farm:['field_crop',{}],pigfarm:['livestock',{}],tomatofarm:['field_crop',{}],zucchinifarm:['greenhouse',{}],appleorchard:['orchard',{}],pearorchard:['orchard',{}],cherryorchard:['orchard',{}],potatofarm:['field_crop',{}],cornfarm:['field_crop',{}],peafarm:['field_crop',{}],
    forestry:['forest_resource',{}],fishery:['fish_resource',{}],mine:['ore_extraction',{}],aluminum_mine:['aluminum_extraction',{}],
    slaughterhouse:['light_industry',{}],cannery:['light_industry',{}],foodfactory:['light_industry',{}],furniture:['light_industry',{}],toolworks:['light_industry',{}],
    electronics:['medium_industry',{}],pharma:['medium_industry',{}],aluminumworks:['energy_intensive_industry',{}],chemical:['chemical_industry',{}]
  };

  function mergedRules(facilityDef){
    const profile=locationProfiles[facilityDef?.locationProfile]||locationProfiles.universal;
    return {...plain(profile.rules),...plain(facilityDef?.locationRules)};
  }
  function labelResource(id){return resourceTypes[id]?.name||id}
  function labelGeography(id){return geographyTypes[id]?.name||id}
  function labelClimate(id){return climates[id]?.name||id}
  function evaluate(cityId,facilityId,{ignoreLimit=false}={}){
    const city=cityProfiles[cityId],facility=window.HF_CONTENT?.registry?.facilities?.[facilityId];
    if(!city||!facility)return {allowed:false,cityId,facilityId,profileId:null,missing:['Unbekannter Standort oder Betrieb'],met:[],reasons:['Unbekannter Standort oder Betrieb']};
    const profile=locationProfiles[facility.locationProfile]||locationProfiles.universal,rules=mergedRules(facility),missing=[],met=[];
    const resources=new Set(city.resources||[]),geography=new Set(city.geography||[]),special=new Set(city.specializations||[]);
    const allRes=unique(rules.requiresAllResources),anyRes=unique(rules.requiresAnyResources),forbidRes=unique(rules.forbiddenResources);
    for(const id of allRes)(resources.has(id)?met:missing).push(resources.has(id)?labelResource(id):`${labelResource(id)} fehlt`);
    if(anyRes.length){const hit=anyRes.find(id=>resources.has(id));if(hit)met.push(labelResource(hit));else missing.push(`Benötigt ${anyRes.map(labelResource).join(' oder ')}`)}
    for(const id of forbidRes)if(resources.has(id))missing.push(`${labelResource(id)} ist ungeeignet`);
    const allGeo=unique(rules.requiresAllGeography),anyGeo=unique(rules.requiresAnyGeography),forbidGeo=unique(rules.forbiddenGeography);
    for(const id of allGeo)(geography.has(id)?met:missing).push(geography.has(id)?labelGeography(id):`${labelGeography(id)} fehlt`);
    if(anyGeo.length){const hit=anyGeo.find(id=>geography.has(id));if(hit)met.push(labelGeography(hit));else missing.push(`Benötigt ${anyGeo.map(labelGeography).join(' oder ')}`)}
    for(const id of forbidGeo)if(geography.has(id))missing.push(`Nicht geeignet: ${labelGeography(id)}`);
    const allowedClimates=unique(rules.allowedClimates),forbiddenClimates=unique(rules.forbiddenClimates);
    if(allowedClimates.length){if(allowedClimates.includes(city.climate))met.push(`Klima: ${labelClimate(city.climate)}`);else missing.push(`Klima benötigt: ${allowedClimates.map(labelClimate).join(' oder ')}`)}
    if(forbiddenClimates.includes(city.climate))missing.push(`Klima ungeeignet: ${labelClimate(city.climate)}`);
    const allSpecial=unique(rules.requiresAllSpecializations),anySpecial=unique(rules.requiresAnySpecializations);
    for(const id of allSpecial)(special.has(id)?met:missing).push(special.has(id)?`Spezialisierung: ${id}`:`Spezialisierung ${id} fehlt`);
    if(anySpecial.length){const hit=anySpecial.find(id=>special.has(id));if(hit)met.push(`Spezialisierung: ${hit}`);else missing.push(`Benötigt Spezialisierung ${anySpecial.join(' oder ')}`)}
    const minTier=Number(rules.minCityTier)||0,minIndustry=Number(rules.minIndustryPotential)||0,minEnergy=Number(rules.minEnergyPotential)||0;
    if(minTier)((CITY[cityId]?.tier||0)>=minTier?met:missing).push((CITY[cityId]?.tier||0)>=minTier?`Stadtstufe ${CITY[cityId]?.tier}`:`Mindestens Stadtstufe ${minTier}`);
    if(minIndustry)(city.industryPotential>=minIndustry?met:missing).push(city.industryPotential>=minIndustry?`Industriepotenzial ${city.industryPotential}/3`:`Industriepotenzial ${minIndustry}/3 benötigt`);
    if(minEnergy)(city.energyPotential>=minEnergy?met:missing).push(city.energyPotential>=minEnergy?`Energiepotenzial ${city.energyPotential}/3`:`Energiepotenzial ${minEnergy}/3 benötigt`);
    if(!ignoreLimit&&Number(rules.maxPerCity)>0){const count=(state.cities?.[cityId]?.facilities||[]).filter(id=>id===facilityId).length;if(count>=Number(rules.maxPerCity))missing.push(`Maximal ${rules.maxPerCity} pro Stadt`);else met.push(`${count}/${rules.maxPerCity} gebaut`)}
    return {allowed:missing.length===0,cityId,facilityId,profileId:profile.id,profileName:profile.name,description:profile.description,missing,met,reasons:missing.length?missing:[profile.description],city:clone(city),rules:clone(rules)};
  }
  function syncAllowedSet(facilityId){
    if(!FACILITIES[facilityId])return;
    const allowed=CITIES.filter(c=>evaluate(c.id,facilityId,{ignoreLimit:true}).allowed).map(c=>c.id),def=window.HF_CONTENT?.registry?.facilities?.[facilityId];
    if(def){def.locationAllowedCities=[...allowed];def.allowedCities=[...allowed];def.allowedEverywhere=allowed.length===CITIES.length}
    // RAW_ALLOWED remains a compact legacy index for resource/raw location advantages only.
    if(FACILITIES[facilityId].raw)RAW_ALLOWED[facilityId]=new Set(allowed);else delete RAW_ALLOWED[facilityId];
  }
  function syncAllAllowedSets(){for(const id of Object.keys(FACILITIES))syncAllowedSet(id)}
  function assignFacilityLocation(id,profileId,rules={}){
    const def=window.HF_CONTENT?.registry?.facilities?.[id];if(!def)return null;
    def.locationProfile=profileId||def.locationProfile||'universal';def.locationRules={...plain(def.locationRules),...plain(rules)};def.allowedCities=[];def.allowedEverywhere=false;syncAllowedSet(id);return def;
  }
  for(const [id,[profile,rules]] of Object.entries(facilityAssignments))assignFacilityLocation(id,profile,rules);
  for(const [id,def] of Object.entries(window.HF_CONTENT?.registry?.facilities||{}))if(!def.locationProfile)assignFacilityLocation(id,def.raw?'universal':'light_industry',{});
  syncAllAllowedSets();

  // All legacy code now asks the central rule evaluator. No road/rail/port condition exists here.
  facilityAllowed=function(cityId,fid){return !!evaluate(cityId,fid).allowed};

  function cityFeatureText(cityId){const p=cityProfiles[cityId];if(!p)return '';const resource=(p.resources||[]).map(id=>resourceTypes[id]?.icon+' '+labelResource(id)).join(' · ')||'keine besonderen Naturressourcen';return `${labelClimate(p.climate)} · Industrie ${p.industryPotential}/3 · Energie ${p.energyPotential}/3 · ${resource}`}
  function statusMarkup(check){
    if(check.allowed)return `<div class="hf-v136-location ok"><b>✓ Standort geeignet</b><span>${check.profileName}</span></div>`;
    return `<div class="hf-v136-location no"><b>✕ Nicht verfügbar</b><span>${check.missing.map(escAttr).join(' · ')}</span></div>`;
  }
  const locationBuildGroups=[
    {id:'agriculture',name:'Landwirtschaft',icon:'🌾',desc:'Felder, Plantagen und Tierhaltung',items:['farm','pigfarm','tomatofarm','zucchinifarm','appleorchard','pearorchard','cherryorchard','potatofarm','cornfarm','peafarm']},
    {id:'natural',name:'Forst & Fischerei',icon:'🌲',desc:'Natürliche Rohstoffe',items:['forestry','fishery']},
    {id:'mines',name:'Minen',icon:'⛏️',desc:'Erz und Aluminiumerz',items:['mine','aluminum_mine']},
    {id:'food',name:'Lebensmittel',icon:'🥫',desc:'Verarbeitung landwirtschaftlicher Waren',items:['slaughterhouse','cannery','foodfactory']},
    {id:'industry',name:'Industrie',icon:'🏭',desc:'Metall, Möbel, Textilien und Werkzeuge',items:['aluminumworks','furniture','toolworks']},
    {id:'tech',name:'Chemie & Technik',icon:'⚗️',desc:'Chemikalien, Medizin und Elektronik',items:['chemical','pharma','electronics']}
  ];
  openFacility=function(){
    const c=CITY[state.selected],s=state.cities[c.id];if(!s.unlocked)return;if(s.facilities.length>=c.slots)return toast('Alle Bauplätze sind belegt.','bad');
    const groups=locationBuildGroups.map(group=>{const ids=(group.items||[]).filter((id,index,arr)=>FACILITIES[id]&&arr.indexOf(id)===index);if(!ids.length)return '';const cards=ids.map(id=>{const f=FACILITIES[id],check=evaluate(c.id,id),allowed=check.allowed;return `<div class="list-item facility-build-card hf-v136-card ${allowed?'':'blocked'}" data-facility-id="${id}"><div class="asset-showcase">${facilityImg(id)}</div><div><div class="row"><div><b>${f.name}</b><div class="sub">${facilityFlowText(id,true)}</div></div><span class="pill">${money(f.cost)}</span></div>${statusMarkup(check)}<button class="btn sm ${f.raw?'orange':'primary'} full" style="margin-top:8px" onclick="window.HF.buildFacility('${id}')" ${state.cash<f.cost||!allowed?'disabled':''}>${allowed?'Bauen':'Nicht verfügbar'}</button></div></div>`}).join('');return `<div class="hf-build-group"><h3>${group.icon} ${group.name}</h3><div class="sub">${group.desc}</div></div><div class="list">${cards}</div>`}).join('');
    const modal=document.getElementById('modal');modal.className='modal project-dialog-open hf-v136-build-modal';modal.innerHTML=`<h2>Betrieb in ${c.name} bauen</h2><p class="sub">Standorte richten sich nur nach Naturraum, Ressourcen, Klima und lokalem Industriepotenzial. Wie Waren angeliefert werden, entscheidest du vollständig selbst.</p><div class="hf-v136-city-profile">${cityFeatureText(c.id)}</div>${groups}<div class="modal-actions"><button class="btn secondary" onclick="window.HF.closeModal()">Schließen</button></div>`;document.getElementById('modalBack').classList.add('show');
  };
  const previousBuild=buildFacility;
  buildFacility=function(id){const check=evaluate(state.selected,id);if(!check.allowed){toast(check.missing[0]||'Standort ungeeignet.','bad');return}return previousBuild(id)};

  function registerLocationProfile(input){const raw=plain(input);if(!raw.id)throw new Error('Standortprofil ohne ID');locationProfiles[raw.id]={...locationProfiles[raw.id],...clone(raw),rules:{...plain(locationProfiles[raw.id]?.rules),...plain(raw.rules)}};syncAllAllowedSets();return locationProfiles[raw.id]}
  function registerCityProfile(input){const raw=plain(input),base=cityProfiles[raw.id];if(!base)throw new Error('Unbekannte Stadtprofil-ID: '+String(raw.id));cityProfiles[raw.id]={...base,...clone(raw),resources:unique(raw.resources??base.resources),geography:unique(raw.geography??base.geography),specializations:unique(raw.specializations??base.specializations)};syncAllAllowedSets();return cityProfiles[raw.id]}
  function applyFacilityDefinition(raw){const id=raw?.id,def=window.HF_CONTENT?.registry?.facilities?.[id];if(!def)return null;def.locationProfile=raw.locationProfile||def.locationProfile||(def.raw?'universal':'light_industry');def.locationRules={...plain(def.locationRules),...plain(raw.locationRules)};syncAllowedSet(id);return def}
  function locationValidate(){
    const errors=[],warnings=[];
    for(const [id,p] of Object.entries(cityProfiles)){if(!climates[p.climate])errors.push(`Stadt ${id}: Klima ${p.climate} fehlt`);for(const r of p.resources||[])if(!resourceTypes[r])errors.push(`Stadt ${id}: Ressource ${r} fehlt`);for(const g of p.geography||[])if(!geographyTypes[g])errors.push(`Stadt ${id}: Geografie ${g} fehlt`);if(!(Number(p.industryPotential)>=1&&Number(p.industryPotential)<=3))errors.push(`Stadt ${id}: Industriepotenzial ungültig`);if(!(Number(p.energyPotential)>=1&&Number(p.energyPotential)<=3))errors.push(`Stadt ${id}: Energiepotenzial ungültig`)}
    for(const [id,f] of Object.entries(window.HF_CONTENT?.registry?.facilities||{})){if(!locationProfiles[f.locationProfile])errors.push(`Betrieb ${id}: Standortprofil ${f.locationProfile} fehlt`);const rules=mergedRules(f);for(const r of [...unique(rules.requiresAllResources),...unique(rules.requiresAnyResources),...unique(rules.forbiddenResources)])if(!resourceTypes[r])errors.push(`Betrieb ${id}: Ressource ${r} fehlt`);for(const g of [...unique(rules.requiresAllGeography),...unique(rules.requiresAnyGeography),...unique(rules.forbiddenGeography)])if(!geographyTypes[g])errors.push(`Betrieb ${id}: Geografie ${g} fehlt`);for(const c of [...unique(rules.allowedClimates),...unique(rules.forbiddenClimates)])if(!climates[c])errors.push(`Betrieb ${id}: Klima ${c} fehlt`);for(const forbidden of ['requiresInfrastructure','requiresAnyInfrastructure','requiresTransport','requiresRoad','requiresRail','requiresPort'])if(rules[forbidden])errors.push(`Betrieb ${id}: Verkehrsvoraussetzung ${forbidden} ist nicht zulässig`);if(FACILITIES[id]?.raw&&(RAW_ALLOWED[id]?.size||0)===0)warnings.push(`Betrieb ${id}: kein geeigneter Standort`)}
    return {ok:errors.length===0,build:BUILD,schema:SCHEMA,counts:{cities:Object.keys(cityProfiles).length,locationProfiles:Object.keys(locationProfiles).length,resources:Object.keys(resourceTypes).length},errors,warnings};
  }

  if(window.HF_CONTENT){
    const baseRegisterFacility=window.HF_CONTENT.registerFacility?.bind(window.HF_CONTENT);
    if(baseRegisterFacility)window.HF_CONTENT.registerFacility=function(def,options){const result=baseRegisterFacility(def,options);applyFacilityDefinition(def);return result};
    const baseApply=window.HF_CONTENT.applyContentPack?.bind(window.HF_CONTENT);
    if(baseApply)window.HF_CONTENT.applyContentPack=function(pack,options){for(const p of pack?.locationProfiles||[])registerLocationProfile(p);for(const p of pack?.cityProfiles||[])registerCityProfile(p);baseApply(pack,options);for(const f of pack?.facilities||[])applyFacilityDefinition(f);syncAllAllowedSets();const report=window.HF_CONTENT.validate();if(options?.render!==false)try{renderAll()}catch(_){ }return report};
    const baseManifest=window.HF_CONTENT.contentManifest?.bind(window.HF_CONTENT);
    if(baseManifest)window.HF_CONTENT.contentManifest=function(){const m=baseManifest();m.buildVersion=BUILD;m.locationSchema=SCHEMA;m.resourceTypes=clone(resourceTypes);m.climates=clone(climates);m.geographyTypes=clone(geographyTypes);m.locationProfiles=clone(locationProfiles);m.cityProfiles=clone(cityProfiles);return m};
    const baseValidate=window.HF_CONTENT.validate?.bind(window.HF_CONTENT);
    if(baseValidate)window.HF_CONTENT.validate=function(){const base=baseValidate(),loc=locationValidate();base.build=BUILD;base.locationSchema=SCHEMA;base.counts={...(base.counts||{}),cities:loc.counts.cities,locationProfiles:loc.counts.locationProfiles,resources:loc.counts.resources};base.errors=[...(base.errors||[]),...loc.errors];base.warnings=[...(base.warnings||[]),...loc.warnings];base.ok=base.errors.length===0;return base};
    const baseTemplate=window.HF_CONTENT.newGoodTemplate?.bind(window.HF_CONTENT);
    if(baseTemplate)window.HF_CONTENT.newGoodTemplate=function(){const t=baseTemplate();if(t.facilities?.[0]){t.facilities[0].locationProfile='light_industry';t.facilities[0].locationRules={}}return t};
    Object.assign(window.HF_CONTENT,{buildVersion:BUILD,locationSchema:SCHEMA,resourceTypes,climates,geographyTypes,locationProfiles,cityProfiles,evaluateLocation:evaluate,registerLocationProfile,registerCityProfile,syncLocationRules:syncAllAllowedSets,locationValidate});
    window.HF_CONTENT.registry.locationSchema=SCHEMA;window.HF_CONTENT.registry.locationProfiles=locationProfiles;window.HF_CONTENT.registry.cityProfiles=cityProfiles;
  }
  if(state){state.locationSchema=SCHEMA;state.locationBuild=BUILD}
  if(!document.getElementById('hf-v136-location-style')){const style=document.createElement('style');style.id='hf-v136-location-style';style.textContent=`
    .hf-v136-city-profile{margin:10px 0 14px;padding:10px 11px;border-radius:11px;background:#edf5ef;color:#315b49;font-size:10px;font-weight:800;line-height:1.4}
    .hf-v136-location{margin-top:7px;padding:7px 8px;border-radius:9px;display:grid;gap:2px;font-size:9px;line-height:1.3}.hf-v136-location b{font-size:10px}.hf-v136-location span{color:inherit;opacity:.86}.hf-v136-location.ok{background:#e6f5eb;color:#176447}.hf-v136-location.no{background:#fff0e9;color:#9b452e}.hf-v136-card.blocked{opacity:.82}.hf-v136-build-modal{width:min(720px,calc(100vw - 18px));max-height:calc(100dvh - 18px);overflow:auto}
  `;document.head.appendChild(style)}

  window.HF={...window.HF,openFacility,buildFacility,contentAudit:window.HF_CONTENT?.validate,exportContentManifest:window.HF_CONTENT?.contentManifest,applyContentPack:window.HF_CONTENT?.applyContentPack,locationSystem:{version:BUILD,schema:SCHEMA,transportNeutral:true,resourceTypes,climates,geographyTypes,locationProfiles,cityProfiles,evaluate,validate:locationValidate,sync:syncAllAllowedSets},facilityLocationCheck:evaluate,cityLocationProfile:id=>clone(cityProfiles[id]),hfV136:{version:BUILD,locationSchema:SCHEMA,transportRequirements:false,addedCity:'sissach',mapVisibilityFix:true}};
  const audit=window.HF_CONTENT?.validate?window.HF_CONTENT.validate():locationValidate();window.__HF_LOCATION_AUDIT__=locationValidate();window.__HF_CONTENT_AUDIT__=audit;if(!audit.ok)console.error('Standortsystem-Prüfung fehlgeschlagen',audit.errors);
  function mark(){try{window.__HF_BUILD__=BUILD;document.documentElement.dataset.hfVersion=BUILD;if(document.body){document.body.dataset.hfBuild=BUILD;document.body.dataset.hfLocationSchema=String(SCHEMA)}const badge=document.getElementById('hfStabilityBuild');if(badge)badge.textContent=window.hfCurrentBuildLabel?.()||'HF 1.1.38 · Versorgungslogistik';}catch(_){ }}
  mark();setTimeout(()=>{syncAllAllowedSets();mark();try{renderAll()}catch(_){ }try{save(false)}catch(_){ }},950);setTimeout(mark,1700);


    return {openFacility,buildFacility,facilityAllowed,locationSystem:window.HF.locationSystem,audit:window.__HF_LOCATION_AUDIT__};
  }

  global.HF_CITY_RULES = Object.freeze({
    normalizeCityEntry,
    normalizeCatalog,
    cityIds,
    cityIdsByMinimumTier,
    allCitiesSet,
    minimumTierSet,
    lakeTownsSet,
    lakeTownIds: Object.freeze([...LAKE_TOWN_IDS]),
    rawAllowed: RAW_ALLOWED,
    createLocationSystem
  });
})(window);
