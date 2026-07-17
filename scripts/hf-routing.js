(function(){'use strict';
function createRoutingApi({getState,CITIES,VEHICLES,transportSpec,vehicleCanUseEdge,getNetworkNodes}){
function graph(vehicleId){const state=getState(),nodes=typeof getNetworkNodes==='function'?getNetworkNodes():CITIES,g={};nodes.forEach(n=>g[n.id]=[]);state.connections.forEach(e=>{if(!g[e.a]||!g[e.b]||!vehicleCanUseEdge(vehicleId,e))return;const t=transportSpec(e),v=VEHICLES[vehicleId],w=e.distance/Math.min(t.speed,v.speed);g[e.a].push({to:e.b,e,w});g[e.b].push({to:e.a,e,w});});return g;}
function findPath(start,end,vehicleId){if(start===end||!VEHICLES[vehicleId])return null;const g=graph(vehicleId);if(!g[start]||!g[end])return null;const D={},prev={},prevE={},q=new Set(Object.keys(g));Object.keys(g).forEach(k=>D[k]=Infinity);D[start]=0;while(q.size){let u=null;for(const k of q)if(u===null||D[k]<D[u])u=k;if(u===null||D[u]===Infinity)break;q.delete(u);if(u===end)break;for(const n of g[u]){const nd=D[u]+n.w;if(nd<D[n.to]){D[n.to]=nd;prev[n.to]=u;prevE[n.to]=n.e}}}if(!prev[end])return null;const path=[end],edges=[];let x=end;while(x!==start){edges.unshift(prevE[x]);x=prev[x];path.unshift(x)}const distance=edges.reduce((sum,e)=>sum+e.distance,0),time=edges.reduce((sum,e)=>sum+e.distance/Math.min(transportSpec(e).speed,VEHICLES[vehicleId].speed),0);return{path,edges,distance,timeHours:Math.max(.2,time)}}
function tripsNeeded(vehicleId,amount){return Math.ceil(amount/VEHICLES[vehicleId].load)}
function transportCost(route,vehicleId,trips){return Math.round(route.distance*VEHICLES[vehicleId].kmCost*trips)}
return {graph,findPath,tripsNeeded,transportCost};}
window.HF_ROUTING={createRoutingApi};
})();
