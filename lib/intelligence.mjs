const positionName={1:'PT',2:'DF',3:'MC',4:'DL',5:'ENT'};
const validMoney=n=>Number.isSafeInteger(n)&&n>=0;
export function buildIntelligence({capturedAt,seasonStart,ownId,settings,rows,standings,profiles,catalog,events}){
 if(settings.maximumBid!=='quarterTeam')throw Error('El límite de puja de la liga ha cambiado');
 if(settings.clause!=='steal')throw Error('La configuración de cláusulas ha cambiado');
 if(!catalog?.players||!Array.isArray(profiles)||profiles.length!==rows.length)throw Error('Faltan datos de plantilla');
 const rowMap=new Map(rows.map(r=>[r.id,r]));
 const profileMap=new Map(profiles.map(p=>[p.id,p]));
 const own=rowMap.get(ownId);
 if(!own)throw Error('Falta el usuario propio');
 const bidLimits=[];
 for(const row of rows){
  const profile=profileMap.get(row.id);
  if(!Array.isArray(profile?.players)||profile.players.length!==row.squadCount)throw Error('Falta una plantilla completa: '+row.name);
  let teamValue=0;
  for(const item of profile.players){
   const player=catalog.players[item.id];
   if(!player||!validMoney(player.price))throw Error('Falta valor de jugador en plantilla');
   teamValue+=player.price;
  }
  if(!Number.isSafeInteger(teamValue))throw Error('Valor de equipo no válido');
  const official=standings?.find(s=>s.id===row.id)?.teamValue;
  if(validMoney(official))teamValue=official;
  bidLimits.push({id:row.id,name:row.name,balance:row.balance,teamValue,maxBid:Math.max(0,row.balance+Math.floor(teamValue/4)),squadCount:row.squadCount,verified:row.id===ownId});
 }
 bidLimits.sort((a,b)=>b.maxBid-a.maxBid);
 const ownLimit=bidLimits.find(r=>r.id===ownId);
 const targets=[];
 for(const profile of profiles){
  if(profile.id===ownId)continue;
  const seller=rowMap.get(profile.id);
  const listed=new Map((profile.market||[]).filter(m=>m.type==='sale').map(m=>[m.playerID,m]));
  for(const owned of profile.players){
   const player=catalog.players[owned.id];
   const clause=owned.owner?.clause;
   if(!validMoney(clause)||clause===0)continue;
   const marketValue=player.price;
   const market=listed.get(owned.id);
   const points=Number.isSafeInteger(player.points)?player.points:null;
   targets.push({playerId:owned.id,name:player.name,position:positionName[player.position]||'OTRA',club:catalog.teams?.[player.teamID]?.name||'',points,marketValue,priceChange:player.priceIncrement??0,clause,ownerId:profile.id,ownerName:seller.name,ownerBalance:seller.balance,onSale:!!market,askingPrice:market?.price??null,withinBidLimit:clause<=ownLimit.maxBid,cashShortfall:Math.max(0,clause-own.balance),pointsPerMillion:points===null?null:Math.round(points*10000000/clause)/10,clausePremiumPct:marketValue>0?Math.round((clause/marketValue-1)*100):null,lockedUntil:settings.clauseActivationDelay&&owned.owner.date?owned.owner.date+settings.clauseActivationDelay*86400:null});
  }
 }
 targets.sort((a,b)=>(b.pointsPerMillion??-1)-(a.pointsPerMillion??-1)||(b.points??-1)-(a.points??-1));
 const deals=[];
 for(const event of events){
  if(!['transfer','loan'].includes(event.type)||event.date<seasonStart)continue;
  for(const action of event.content){
   if(!action.from||!action.to||!rowMap.has(action.from.id)||!rowMap.has(action.to.id))continue;
   const player=catalog.players[action.player];
   deals.push({date:event.date,playerId:action.player,playerName:player?.name||`Jugador ${action.player}`,position:positionName[player?.position]||'OTRA',points:player?.points??null,fromId:action.from.id,fromName:rowMap.get(action.from.id).name,toId:action.to.id,toName:rowMap.get(action.to.id).name,amount:action.amount,type:event.type==='loan'?'loan':action.type==='clause'?'clause':'direct'});
  }
 }
 deals.sort((a,b)=>b.date-a.date);
 return {available:true,capturedAt,settings:{maximumBid:settings.maximumBid,teamMaxSize:settings.teamMaxSize,clause:settings.clause,clauseActivationDelay:settings.clauseActivationDelay,clauseRoundDisabledHours:settings.clauseRoundDisabledHours,maxPurchasePrice:settings.maxPurchasePrice},ownLimit, bidLimits,targets,deals};
}
