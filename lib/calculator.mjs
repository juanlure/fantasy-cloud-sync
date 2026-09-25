const passive = new Set(['playerMovements','adminText','roundStarted','bettingPool','leagueSettings','userName','leagueReset']);
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const money = v => {assert(Number.isSafeInteger(v),'Importe no válido en el tablón');return v;};
export function calculate(x) {
 const reset=x.events.filter(e=>e.type==='leagueReset').sort((a,b)=>b.date-a.date)[0];
 assert(reset,'Falta el reinicio: historial incompleto');
 assert(reset.content.type==='full'&&reset.content.distribution===10,'Reparto inicial no compatible; requiere revisión');
 const s=x.settings;
 assert(s.splitRound==='recalculation'&&s.clauseDecrement===0&&s.bonusPoint===25000&&!s.bonusDailyStreak&&!s.salariesFixed&&!s.salariesVariable,'Las reglas económicas han cambiado; requiere revisión');
 for(const k of ['bonusFixed','bonusIdealLineup','bonusProfitableLineup','bonusWorstLineup','bonusGameMVP','bonusRoundMVP','bonusGoal','bonusCleanSheet','bonusRatio','jackpot']) assert(!s[k],'Prima adicional no compatible: '+k);
 for(const k of ['bonusRoundPosition','bonusRoundPointsPosition','bonusLeaguePosition']) assert(!s[k]?.length,'Prima por posición no compatible');
 const events=x.events.filter(e=>e.date>=reset.date).sort((a,b)=>a.date-b.date);
 assert(new Set(events.map(e=>JSON.stringify(e))).size===events.length,'Hay eventos duplicados; repetir consulta');
 const rows=new Map(x.standings.map(u=>[u.id,{id:u.id,name:u.name,points:u.points,balance:50000000,breakdown:{initial:50000000,sales:0,purchases:0,bonuses:0,loans:0,deposits:0,refunds:0},unconfirmedClauseRefund:0,squad:new Set()}]));
 const rounds=new Map(), deposits=new Map(), ledger=[];
 function add(e,uid,category,amount,detail){const r=rows.get(uid);assert(r,'Ha cambiado un participante; requiere revisión');money(amount);r.balance+=amount;r.breakdown[category]+=amount;if(amount)ledger.push({date:e.date,userId:uid,name:r.name,category,amount,detail});}
 function move(a){if(a.from){const r=rows.get(a.from.id);assert(r?.squad.has(a.player),'No cuadra la plantilla: falta un movimiento');r.squad.delete(a.player);}if(a.to){assert(rows.has(a.to.id),'Participante desconocido');rows.get(a.to.id).squad.add(a.player);}}
 for(const e of events){const t=e.type,c=e.content;
  if(['market','transfer','loan'].includes(t))for(const a of c){
   money(a.amount);
   if(a.from)add(e,a.from.id,t==='loan'?'loans':'sales',a.amount,`${t}: jugador ${a.player}`);
   if(a.to)add(e,a.to.id,t==='loan'?'loans':'purchases',-a.amount,`${t}: jugador ${a.player}`);
   if(t==='transfer'&&a.from){const k=a.from.id+':'+a.player;const d=deposits.get(k)||0;deposits.delete(k);if(d&&a.type==='clause')rows.get(a.from.id).unconfirmedClauseRefund+=d;}
   move(a);
  } else if(t==='loanReturn')for(const a of c){add(e,a.from.id,'loans',a.refund||0,`Retorno: jugador ${a.player}`);add(e,a.to.id,'loans',-(a.refund||0),`Retorno: jugador ${a.player}`);move(a);}
  else if(t==='clauseIncrement')for(const a of c){const k=a.user.id+':'+a.player;deposits.set(k,(deposits.get(k)||0)+money(a.amount));add(e,a.user.id,'deposits',-a.amount,`Cláusula: jugador ${a.player}`);}
  else if(t==='roundFinished'){
   const key=c.round.name.match(/^(?:Jornada|Round) (\d+)/)?.[1];assert(key,'Nombre de jornada no reconocido');
   const prev=rounds.get(key)||new Map();const current=new Map(c.results.map(a=>[a.user.id,a]));
   assert(current.size===rows.size,'Resultados de jornada incompletos');
   for(const [uid,a] of current)add(e,uid,'bonuses',(a.bonus||0)-(prev.get(uid)?.bonus||0),c.round.name);
   rounds.set(key,current);
  } else assert(passive.has(t),'Movimiento no reconocido: '+t);
 }
 for(const r of rows.values()){
  let points=0;for(const round of rounds.values()){const a=round.get(r.id);assert(a,'Resultados incompletos');points+=a.count===0?0:a.points;}
  assert(points===r.points,'Los puntos no cuadran con la clasificación; repetir consulta');
  assert(r.breakdown.bonuses===r.points*25000,'Las primas no cuadran con los puntos');
  r.squadCount=r.squad.size;delete r.squad;r.verified=r.id===x.user.id;
 }
 assert(rows.get(x.user.id)?.balance===x.user.balance,'El cálculo no coincide con tu saldo real; requiere revisión');
 assert([...rows.values()].reduce((v,r)=>v+r.breakdown.loans,0)===0,'No cuadran las cesiones');
 return {calculationVersion:2,league:x.leagueName,leagueId:x.leagueId,capturedAt:x.capturedAt||new Date().toISOString(),seasonStart:reset.date,eventCount:events.length,ownId:x.user.id,ownVerified:true,rows:[...rows.values()].sort((a,b)=>b.balance-a.balance),ledger:ledger.reverse(),latestEvent:Math.max(...events.map(e=>e.date)),warnings:['No se suman devoluciones de cláusulas sin un ingreso separado confirmado. Las posibles devoluciones quedan en revisión.','Los saldos rivales se reconstruyen del tablón. Los ajustes privados y posibles recompensas antiguas no visibles no pueden verificarse.']};
}

// Stored V1 snapshots contain inferred credits, not independent board events.
// Migrate them on every read so a failed refresh cannot resurrect the assumption.
export function upgradeSnapshot(snapshot){
 if(snapshot.calculationVersion>=2)return snapshot;
 const data=structuredClone(snapshot);
 for(const row of data.rows){
  const inferred=row.breakdown.refunds||0;
  row.balance-=inferred;row.breakdown.refunds=0;row.unconfirmedClauseRefund=inferred;
 }
 data.rows.sort((a,b)=>b.balance-a.balance);
 data.ledger=data.ledger.filter(m=>m.category!=='refunds');
 data.calculationVersion=2;
 data.warnings=['No se suman devoluciones de cláusulas sin un ingreso separado confirmado.',...(data.warnings||[])];
 return data;
}
