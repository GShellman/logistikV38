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

  global.HF_CITY_RULES = Object.freeze({
    normalizeCityEntry,
    normalizeCatalog,
    cityIds,
    cityIdsByMinimumTier,
    allCitiesSet,
    minimumTierSet,
    lakeTownsSet,
    lakeTownIds: Object.freeze([...LAKE_TOWN_IDS]),
    rawAllowed: RAW_ALLOWED
  });
})(window);
