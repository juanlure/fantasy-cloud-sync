import {calculate} from './calculator.mjs';
import {buildIntelligence} from './intelligence.mjs';
export async function fetchSnapshot(token, fetcher=fetch){
 if(!token)throw Error('Falta la conexión con Biwenger');
 const leagueId=Number(process.env.BW_LEAGUE_ID),userId=Number(process.env.BW_USER_ID);
 if(!Number.isSafeInteger(leagueId)||!Number.isSafeInteger(userId))throw Error('Falta la configuración de la liga');
 const headers={Authorization:'Bearer '+token,'X-League':String(leagueId),'X-User':String(userId),'X-Lang':'es',Accept:'application/json'};
 const signal=AbortSignal.timeout(120000);
 let origin='https://biwenger.as.com/api/v2/';
 async function api(path){
  let response=await fetcher(origin+path,{headers,signal,cache:'no-store'});
  if(response.status===403&&response.headers.get('content-type')?.includes('text/html')&&origin.includes('biwenger.as.com')){
   origin='https://cf.biwenger.com/api/v2/';
   response=await fetcher(origin+path,{headers,signal,cache:'no-store'});
  }
  if(response.status===401)throw Error('La sesión de Biwenger ha caducado. Es necesario reconectarla.');
  if(response.status===403){
   const body=await response.text();
   console.warn('Biwenger HTTP 403 en '+path,JSON.stringify({type:response.headers.get('content-type'),server:response.headers.get('server'),trace:response.headers.get('x-cloud-trace-context'),title:body.match(/<title>([^<]*)<\/title>/i)?.[1]||null,code:body.match(/(?:Error\s*code|errorCode|error_code)[:\s<]*([0-9]{3,5})/i)?.[1]||null}));
   throw Error('Biwenger ha rechazado temporalmente el acceso desde el servidor (403). Reintenta más tarde.');
  }
  if(response.status===429)throw Error('Demasiadas consultas a Biwenger. Espera un minuto y vuelve a actualizar.');
  if(!response.ok)throw Error('Biwenger no responde temporalmente (HTTP '+response.status+')');
  const j=await response.json();if(j.status!==200||!j.data)throw Error('Biwenger ha rechazado la consulta. Revisa la sesión.');return j.data;
 }
 const home=await api('home');
 if(home.user?.id!==userId)throw Error('La sesión no corresponde a tu equipo');
 const league=await api('league/'+leagueId+'?fields=settings,standings,competition,scoreID');
 const events=[];let found=false,firstPage;
 for(let offset=0;offset<10000;offset+=100){
  const page=await api('league/'+leagueId+'/board?offset='+offset+'&limit=100');
  if(!Array.isArray(page))throw Error('Formato de tablón no reconocido');
  if(offset===0)firstPage=JSON.stringify(page);
  events.push(...page);
  if(page.some(e=>e.type==='leagueReset')){found=true;break;}
  if(page.length<100)break;
 }
 if(!found)throw Error('No se ha encontrado el reinicio de temporada');
 let profiles=null,catalog=null,insightError=null;
 try{
  const slug=league.competition?.slug,score=league.scoreID;
  if(!/^[a-z0-9-]+$/.test(slug)||!Number.isSafeInteger(score))throw Error('Faltan datos de la competición');
  catalog=await api('competitions/'+slug+'/data?lang=es&score='+score);
  profiles=[];
  const ids=league.standings.map(u=>u.id);
  for(let i=0;i<ids.length;i+=3){
   const group=await Promise.all(ids.slice(i,i+3).map(async id=>({id,...await api('user/'+id+'?fields=players(id,owner),market')})));
   profiles.push(...group);
  }
 }catch{insightError='No se han podido consultar todas las plantillas. Reintenta la actualización.';}
 const check=await api('league/'+leagueId+'/board?offset=0&limit=100');
 const finalHome=await api('home');
 if(JSON.stringify(check)!==firstPage||home.user.balance!==finalHome.user.balance)throw Error('El mercado ha cambiado durante la consulta. Reintenta en un minuto.');
 const snapshot=calculate({capturedAt:new Date().toISOString(),leagueId,leagueName:league.name,settings:league.settings,standings:league.standings,events,user:finalHome.user});
 try{snapshot.intelligence=profiles&&catalog?buildIntelligence({...snapshot,settings:league.settings,profiles,catalog,events}):{available:false,reason:insightError};}
 catch(e){snapshot.intelligence={available:false,reason:e instanceof Error?e.message:'Datos de mercado incompletos'};}
 return snapshot;
}
