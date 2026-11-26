'use strict';
const el=id=>document.getElementById(id);
const endpoints=['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter'];
let markers=[], selectedWay=null, consultedAt;
let run=0,active,choices=[],point;
function element(tag,value){const e=document.createElement(tag);e.textContent=value;return e}
function coordinates(value){
 const m=value.trim().match(/^([+-]?\d+(?:[.,]\d+)?)\s*(?:;\s*|\s+|,\s*)([+-]?\d+(?:[.,]\d+)?)$/);
 if(!m)return null;
 const [lat,lon]=m.slice(1).map(n=>Number(n.replace(',','.')));
 return lat>=-34&&lat<=6&&lon>=-74.1&&lon<=-28.7?{lat,lon}:null;
}
function project(p,origin){return [(p.lon-origin.lon)*111320*Math.cos(origin.lat*Math.PI/180),(p.lat-origin.lat)*110574]}
function closest(geometry,origin){
 let best={distance:Infinity};
 for(let i=1;i<geometry.length;i++){
 const [x,y]=project(geometry[i-1],origin),[x2,y2]=project(geometry[i],origin),dx=x2-x,dy=y2-y,len=dx*dx+dy*dy;
 if(!len)continue;
 const t=Math.max(0,Math.min(1,-(x*dx+y*dy)/len)),distance=Math.hypot(x+t*dx,y+t*dy);
 if(distance<best.distance)best={distance,lat:geometry[i-1].lat+t*(geometry[i].lat-geometry[i-1].lat),lon:geometry[i-1].lon+t*(geometry[i].lon-geometry[i-1].lon),bearing:(Math.atan2(dx,dy)*180/Math.PI+360)%360};
 }return best;
}
function status(title,body){el('output').replaceChildren(element('h2',title),element('p',body))}
function updateMap(p){
 const {lat,lon}=p,b=.003;
 mapCenter=p;zoom=17;el('center').hidden=false;renderTiles();
 el('openmap').href='https://www.openstreetmap.org/?mlat='+lat+'&mlon='+lon+'#map=17/'+lat+'/'+lon;
 el('maptitle').textContent='Ponto consultado';el('position').textContent=lat.toFixed(5)+' , '+lon.toFixed(5);
}
function nameOf(w){return [...new Set([w.tags.ref,w.tags.name].filter(Boolean))].join(' · ')||'Via sem nome'}
function compass(b){return ['norte','nordeste','leste','sudeste','sul','sudoeste','oeste','noroeste'][Math.round(b/45)%8]}
function option(v,s){return new Option(s,String(v))}
function draw(selected){
 el('schemebox').hidden=false;
 const box=el('scheme'),ns='http://www.w3.org/2000/svg';
 const svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','-85 -65 170 130');svg.setAttribute('aria-label','Traçado das vias próximas, com o norte para cima');
 for(const [i,w] of choices.entries()){
 const line=document.createElementNS(ns,'polyline');
 line.setAttribute('points',w.geometry.map(g=>{const [x,y]=project(g,point);return x+','+-y}).join(' '));
 for(const [key,val] of Object.entries({fill:'none',stroke:i===selected?'#126044':'#9aa99d','stroke-width':i===selected?'4':'2'}))line.setAttribute(key,val);
 svg.append(line);
 }
 choices.forEach((w,i)=>{const label=document.createElementNS(ns,'text'), [x,y]=project(w.geometry.reduce((a,b)=>Math.hypot(...project(a,point))<Math.hypot(...project(b,point))?a:b),point);label.setAttribute('x',Math.max(-79,Math.min(70,x)));label.setAttribute('y',Math.max(-53,Math.min(57,-y)));label.setAttribute('font-size','10');label.textContent=i+1;svg.append(label)});
 const dot=document.createElementNS(ns,'circle');dot.setAttribute('r','3');dot.setAttribute('fill','#df8e00');svg.append(dot);
 box.replaceChildren(element('p','Pistas próximas · norte para cima · ponto GPS em laranja'),svg);
}
function selectRoad(){
 const out=el('output'),road=document.createElement('select'),direction=document.createElement('select'),detail=document.createElement('div'),actions=document.createElement('div');
 road.id='road';direction.id='direction';
 const label=(forId,title)=>{const l=element('label',title);l.htmlFor=forId;return l};
 road.add(option('','Selecione a pista'));choices.forEach((w,i)=>road.add(option(i,(i+1)+'. '+nameOf(w)+' · '+Math.round(w.distance)+' m do ponto')));
 out.replaceChildren(element('h2','Confira a pista'),label('road','Via próxima ao ponto'),road,actions,detail);
 function show(){
 detail.replaceChildren();if(road.value==='')return;
 const w=choices[Number(road.value)],a=element('a','Ver trecho e dados no OpenStreetMap');a.href='https://www.openstreetmap.org/way/'+w.id;a.target='_blank';a.rel='noopener noreferrer';
 if(direction.value)detail.append(monitorPanel(w,direction.value,point,consultedAt));
 detail.append(a);
 if(w.timestamp)detail.append(element('small','Última edição do trecho no mapa: '+new Date(w.timestamp).toLocaleDateString('pt-BR')+'. A data se refere ao cadastro da via.'));
 }
 road.onchange=()=>{selectedWay=road.value===''?null:choices[Number(road.value)];renderTiles();actions.replaceChildren();direction.replaceChildren();draw(road.value===''?-1:Number(road.value));
 if(road.value!==''){const w=choices[Number(road.value)],one=w.tags.oneway;
 direction.add(option('','Selecione o sentido'));
 if(one!=='-1')direction.add(option('forward','Rumo aproximado: '+compass(w.bearing)));
 if(!['yes','true','1'].includes(one))direction.add(option('backward','Rumo aproximado: '+compass(w.bearing+180)));
 if(direction.options.length===2)direction.selectedIndex=1;
 actions.append(label('direction','Sentido de deslocamento'),direction);
 }show()};direction.onchange=show;
 if(choices.length===1)road.selectedIndex=1;road.onchange();
}
let satellite=false;
let zoom=4,mapCenter={lat:-14.2,lon:-52};
function renderTiles(){
 const root=el('tiles'),width=root.clientWidth,height=root.clientHeight,scale=2**zoom,lat=mapCenter.lat*Math.PI/180;
 const cx=(mapCenter.lon+180)/360*scale*256,cy=(1-Math.asinh(Math.tan(lat))/Math.PI)/2*scale*256;
 const left=cx-width/2,top=cy-height/2,fragment=document.createDocumentFragment();
 const raster=prepareBackground(mapCenter,zoom,satellite);
 if(raster)drawImagery(fragment,{left,top,width,height,zoom});
 if(raster&&!satellite&&choices.length){
 const ns='http://www.w3.org/2000/svg',overlay=document.createElementNS(ns,'svg');overlay.setAttribute('class','selected-road nearby');
 for(const way of choices){const path=document.createElementNS(ns,'polyline');path.setAttribute('points',way.geometry.map(p=>[(p.lon+180)/360*scale*256-left,(1-Math.asinh(Math.tan(p.lat*Math.PI/180))/Math.PI)/2*scale*256-top].join(',')).join(' '));overlay.append(path)}fragment.append(overlay);
 }
 if(selectedWay){
 const ns='http://www.w3.org/2000/svg', layer=document.createElementNS(ns,'svg'),line=document.createElementNS(ns,'polyline');
 layer.setAttribute('class','selected-road');layer.setAttribute('aria-label','Pista selecionada');
 line.setAttribute('points',selectedWay.geometry.map(p=>[(p.lon+180)/360*scale*256-left,(1-Math.asinh(Math.tan(p.lat*Math.PI/180))/Math.PI)/2*scale*256-top].join(',')).join(' '));layer.append(line);fragment.append(layer);
 }
 if(point){const pin=element('span','');pin.className='pin';pin.style.left=((point.lon+180)/360*scale*256-left)+'px';pin.style.top=((1-Math.asinh(Math.tan(point.lat*Math.PI/180))/Math.PI)/2*scale*256-top)+'px';fragment.append(pin)}
 const placed=[];
 const chosen=el('signlist').value;
 const entries=Array.from(markers.entries()).sort(([i,a],[j,b])=>
   Number(String(j)===chosen)-Number(String(i)===chosen) ||
   Number(b.type==='placa')-Number(a.type==='placa') || a.distance-b.distance);
 for(const [i,m] of entries){
 if(m.type==='trecho'&&!el('segments').checked&&el('signlist').value!==String(i))continue;
 const x=(m.lon+180)/360*scale*256-left;
 const y=(1-Math.asinh(Math.tan(m.lat*Math.PI/180))/Math.PI)/2*scale*256-top;
 if(x<0||y<0||x>width||y>height)continue;
 if(placed.some(p=>Math.abs(x-p.x)<116&&Math.abs(y-p.y)<55))continue;
 placed.push({x,y});
 const button=element('button','');
 button.append(element('span',m.badge.caption),element('b',m.badge.value));
 button.className='speedmark '+m.type;
 button.setAttribute('aria-pressed',String(chosen===String(i)));
 button.setAttribute('aria-label',m.label);button.title=m.label;
 button.style.left=x+'px';button.style.top=y+'px';
 button.onclick=()=>{el('signlist').value=String(i);showMarker();renderTiles();el('signdetail').focus({preventScroll:true});el('signdetail').scrollIntoView({block:'nearest'})};fragment.append(button);
 }
 root.replaceChildren(fragment);el('plus').disabled=zoom>=19;el('minus').disabled=zoom<=3;
}
el('plus').onclick=()=>{zoom=Math.min(19,zoom+1);renderTiles()};
el('minus').onclick=()=>{zoom=Math.max(3,zoom-1);renderTiles()};
new ResizeObserver(renderTiles).observe(el('tiles'));
async function osmWays(p,signal){
 const pad=.0018,bounds=[p.lon-pad,p.lat-pad,p.lon+pad,p.lat+pad].join(',');
 const response=await fetch('https://api.openstreetmap.org/api/0.6/map.json?bbox='+bounds,{signal,cache:'no-store'});
 if(!response.ok)throw Error();const data=await response.json(),nodes=new Map();
 for(const n of data.elements)if(n.type==='node')nodes.set(n.id,n);
 const roads=/^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|road|track|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link)$/;
 const ways=data.elements.filter(w=>w.type==='way'&&roads.test(w.tags?.highway)&&w.nodes.every(id=>nodes.has(id))).map(w=>({...w,geometry:w.nodes.map(id=>nodes.get(id))}));
 return [...ways,...Array.from(nodes.values()).filter(n=>n.tags)];
}
async function lookup(p,signal){
 const query='[out:json][timeout:12];area["ISO3166-1"="BR"]["boundary"="administrative"]["admin_level"="2"]->.br;(node(around:150,'+p.lat+','+p.lon+')[~"^traffic_sign(:.*)?$"~"."];way(around:150,'+p.lat+','+p.lon+')(area.br)["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|road|track|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link)$"];);out meta geom;';
 try{return await osmWays(p,AbortSignal.any([signal,AbortSignal.timeout(12000)]))}catch{if(signal.aborted)throw Error()}
 for(const endpoint of endpoints){const timer=new AbortController(),abort=()=>timer.abort();signal.addEventListener('abort',abort,{once:true});const clock=setTimeout(abort,17500);
 try{if(signal.aborted)throw Error();const response=await fetch(endpoint+'?'+new URLSearchParams({data:query}),{signal:timer.signal,cache:'no-store'});
 if(!response.ok)throw Error();const data=await response.json();if(data.remark||!Array.isArray(data.elements))throw Error();return data.elements;
 }catch(error){if(signal.aborted)throw error}finally{clearTimeout(clock);signal.removeEventListener('abort',abort)}
 }throw Error('Serviço indisponível');
}
el('form').onsubmit=async event=>{event.preventDefault();const id=++run;active?.abort();active=new AbortController();selectedWay=null;consultedAt=new Date();choices=[];markers=[];el('signpanel').hidden=true;renderTiles();el('schemebox').hidden=true;el('schemebox').open=false;el('scheme').replaceChildren();point=coordinates(el('coords').value);
 if(!point){el('center').hidden=true;renderTiles();status('Coordenadas inválidas','Informe latitude e longitude na área do Brasil, na ordem indicada. Use ponto decimal ou separe os valores por ponto e vírgula.');return}
 updateMap(point);status('Buscando vias próximas…','Consultando os dados do OpenStreetMap.');
 try{const rows=await lookup(point,active.signal);if(id!==run)return;
 buildMarkers(rows);
 choices=rows.filter(w=>w.tags&&w.geometry?.length>1).map(w=>({...w,...closest(w.geometry,point)})).filter(w=>w.distance<=60).sort((a,b)=>a.distance-b.distance);
 if(choices.length)selectRoad();else status('Limite não confirmado','Nenhuma via cadastrada foi localizada a até 60 metros desse ponto.');
 }catch{if(id===run)status('Consulta indisponível','O serviço de mapas não respondeu. Tente consultar novamente.')}
};
function valuesFor(tags){
 const rules=[];
 for(const [key,val] of Object.entries(tags)){
 if(!/^maxspeed(?::(?:hgv|motorcycle|forward|backward|conditional|lanes|variable))*$/.test(key))continue;
 const words=key.split(':').slice(1),parts=[words.includes('hgv')?'Caminhão':words.includes('motorcycle')?'Moto':'Geral'];
 for(const [word,label] of Object.entries({forward:'sentido do traçado',backward:'sentido inverso',conditional:'condicional',lanes:'por faixa',variable:'variável'}))if(words.includes(word))parts.push(label);
 rules.push(parts.join(' · ')+': '+val+(/^\d+$/.test(val)?' km/h':''));
 }
 return rules;
}
function markerBadge(tags,type){
 if(type==='placa'){
   const code=tags.traffic_sign||'';
   const match=code.match(/^(?:BR:)?(?:R-?19|maxspeed)\[(\d+)\]$/i);
   const simple=Object.keys(tags).every(k=>!k.startsWith('maxspeed:')&&!k.startsWith('traffic_sign:'));
   if(match&&simple&&(!tags.maxspeed||Number(tags.maxspeed)===Number(match[1])))return {caption:'Placa física',value:match[1]+' km/h'};
   return {caption:'Placa física',value:'Ver placa'};
 }
 for(const id of ['hgv','motorcycle','general']){
   const category=categories.find(c=>c.id===id);
   if(!Object.keys(tags).some(k=>k===category.key||k.startsWith(category.key+':')))continue;
   const directions=tags.oneway==='-1'?['backward']:['yes','true','1'].includes(tags.oneway)?['forward']:['forward','backward'];
   const speeds=directions.map(d=>readLimit(tags,d,category).speed);
   const caption=id==='general'?'Geral da via':category.label;
   return speeds[0]&&speeds.every(n=>n===speeds[0])?{caption,value:speeds[0]+' km/h'}:{caption,value:'Ver regras'};
 }
 return {caption:'Trecho',value:'Ver limites'};
}
function buildMarkers(rows){
 const ways=rows.filter(r=>r.type==='way'&&r.geometry?.length>1);
 for(const r of rows){
 const tags=r.tags||{},rules=valuesFor(tags);
 let location,type,title;
 if(r.type==='node'){
 const codes=Object.entries(tags).filter(([k])=>/^traffic_sign(?::forward|:backward)?$/.test(k));
 if(!codes.some(([,v])=>/maxspeed|(?:^|[:;, ])R-?19\b/i.test(v)))continue;
 location={lat:r.lat,lon:r.lon,distance:Math.hypot(...project(r,point))};type='placa';title='Placa mapeada';
 for(const [key,code] of codes){
 const suffix=key.endsWith(':forward')?' · sentido do traçado':key.endsWith(':backward')?' · sentido inverso':'';
 const numbers=[...code.matchAll(/(?:R-?19|maxspeed)\[(\d+)\]/gi)].map(m=>m[1]+' km/h');
 rules.push('Sinalização'+suffix+': '+(numbers.length?numbers.join(' / ')+' ('+code+')':code));
 }
 const linked=ways.filter(w=>w.nodes?.includes(r.id));
 if(linked.length)title+=' · '+[...new Set(linked.map(nameOf))].join(' / ');
 if(tags.direction)rules.push('Orientação cadastrada: '+tags.direction);
 }else if(r.type==='way'&&r.geometry?.length>1&&rules.length){
 location=closest(r.geometry,point);type='trecho';title='Trecho · '+nameOf(r);
 }else continue;
 if(location.distance>150)continue;
 const badge=markerBadge(tags,type);
 const label=title+' · '+badge.caption+' · '+badge.value+' · '+Math.round(location.distance)+' m';
 markers.push({...location,type,title,label,badge,rules,id:r.id,osmType:r.type});
 }
 markers.sort((a,b)=>a.distance-b.distance);
 const list=el('signlist');list.replaceChildren(option('','Selecione no mapa ou na lista'));
 markers.forEach((m,i)=>list.add(option(i,m.label)));
 el('signpanel').hidden=false;list.hidden=!markers.length;el('signpanel').querySelector('label[for=signlist]').hidden=!markers.length;
 el('signhelp').textContent=markers.length?'Toque em um rótulo para ver os limites. A lista inclui todos os cadastros a até 150 m, inclusive os que se sobrepõem no mapa.':'Nenhuma placa ou via com velocidade cadastrada foi encontrada a até 150 m do GPS.';
 showMarker();renderTiles();
}
function showMarker(){
 const detail=el('signdetail');detail.replaceChildren();
 const choice=el('signlist').value;if(choice==='')return;
 const m=markers[Number(choice)];if(!m)return;
 detail.append(element('strong',m.title),element('small',Math.round(m.distance)+' m do ponto GPS'));
 for(const rule of m.rules)detail.append(element('div',rule));
 detail.append(element('small',m.type==='placa'?'Confira a pista e o sentido da placa.':'O marcador indica o ponto mais próximo do trecho com esse cadastro.'),
 element('small','Valores gerais e específicos são apresentados conforme o cadastro.'));
 const link=element('a','Ver cadastro no OpenStreetMap');link.href='https://www.openstreetmap.org/'+m.osmType+'/'+m.id;link.target='_blank';link.rel='noopener noreferrer';detail.append(link);
}
el('signlist').onchange=()=>{const value=el('signlist').value;if(value!=='')mapCenter=markers[Number(value)];renderTiles();showMarker()};
const viewport=el('map');
function centerOffset(dx,dy){
 const size=256*2**zoom;
 const y=(1-Math.asinh(Math.tan(mapCenter.lat*Math.PI/180))/Math.PI)/2+dy/size;
 mapCenter={lon:Math.max(-180,Math.min(180,mapCenter.lon+dx*360/size)),
 lat:Math.atan(Math.sinh(Math.PI*(1-2*Math.min(1,Math.max(0,y)))))*180/Math.PI};
}
function changeLayer(useSatellite){
 satellite=useSatellite;
 el('street').setAttribute('aria-pressed',String(!satellite));
 el('sat').setAttribute('aria-pressed',String(satellite));
 el('imagerycredit').hidden=!satellite;renderTiles();
}
el('street').onclick=()=>changeLayer(false);
el('sat').onclick=()=>changeLayer(true);
el('center').onclick=()=>{if(point)updateMap(point)};
el('segments').onchange=()=>{if(!el('segments').checked){el('signlist').value='';showMarker()}renderTiles()};
let drag=null;
viewport.onpointerdown=e=>{
 if(!e.isPrimary||e.button!==0||e.target.closest('button,a'))return;
 viewport.setPointerCapture(e.pointerId);drag={id:e.pointerId,x:e.clientX,y:e.clientY};viewport.classList.add('moving');
};
viewport.onpointermove=e=>{
 if(drag?.id!==e.pointerId)return;
 el('streets').style.transform=el('tiles').style.transform='translate('+(e.clientX-drag.x)+'px,'+(e.clientY-drag.y)+'px)';
};
function stopDrag(e){
 if(drag?.id!==e.pointerId)return;
 if(e.type==='pointerup')centerOffset(drag.x-e.clientX,drag.y-e.clientY);
 drag=null;el('streets').style.transform=el('tiles').style.transform='';viewport.classList.remove('moving');renderTiles();
}
viewport.onpointerup=viewport.onpointercancel=viewport.onlostpointercapture=stopDrag;
let lastWheel=-Infinity;
viewport.addEventListener('wheel',e=>{
 if(e.ctrlKey||drag||!e.deltaY)return;
 e.preventDefault();if(e.timeStamp-lastWheel<170)return;
 lastWheel=e.timeStamp;const next=Math.max(3,Math.min(19,zoom-Math.sign(e.deltaY)));
 if(next===zoom)return;
 const rect=viewport.getBoundingClientRect(),dx=e.clientX-rect.left-rect.width/2,dy=e.clientY-rect.top-rect.height/2;
 centerOffset(dx,dy);zoom=next;centerOffset(-dx,-dy);renderTiles();
},{passive:false});
viewport.onkeydown=e=>{
 if(e.target!==viewport)return;
 const offsets={ArrowLeft:[-80,0],ArrowRight:[80,0],ArrowUp:[0,-80],ArrowDown:[0,80]};
 if(offsets[e.key]){e.preventDefault();centerOffset(...offsets[e.key]);renderTiles()}
};
