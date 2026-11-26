'use strict';
let streetMap, streetReady=false, streetFailed=false, streetStarted=false;
let frameId=0;
function startStreets(){
 streetStarted=true;
 const script=document.createElement('script');
 script.src='https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.js';
 script.onload=()=>{
  try {
   streetMap=new maplibregl.Map({container:'streets',style:'https://tiles.openfreemap.org/styles/liberty',center:[mapCenter.lon,mapCenter.lat],zoom:zoom-1,interactive:false,attributionControl:false,fadeDuration:0});
   streetMap.on('load',()=>{streetReady=true;streetFailed=false;renderTiles()});
   streetMap.on('error',()=>{if(!streetFailed){streetFailed=true;renderTiles()}});
   streetMap.getCanvas().addEventListener('webglcontextlost',()=>{streetFailed=true;renderTiles()});
  } catch {streetFailed=true;renderTiles()}
 };
 script.onerror=()=>{streetFailed=true;renderTiles()};
 document.head.append(script);
}
function mapNotice(message){
 const notice=el('mapstatus');notice.textContent=message;notice.hidden=!message;
}
function prepareBackground(center,level,useSatellite){
 frameId++;
 if(!streetStarted&&!useSatellite)startStreets();
 const streetVisible=!useSatellite&&streetReady&&!streetFailed;
 el('streets').style.visibility=streetVisible?'visible':'hidden';
 if(streetMap&&!useSatellite&&!streetFailed){
  streetMap.resize();streetMap.jumpTo({center:[center.lon,center.lat],zoom:level-1});
 }
 el('imagerycredit').hidden=streetVisible;
 mapNotice(streetVisible?'':!useSatellite&&streetFailed?'Mapa de ruas indisponível. Exibindo imagem aérea de referência.':'');
 return !streetVisible;
}
function drawImagery(fragment,view){
 const generation=frameId,world=2**view.zoom;
 const sourceLevel=view.zoom,size=256;
 for(let y=Math.max(0,Math.floor(view.top/size));y<=Math.min(world-1,Math.floor((view.top+view.height)/size));y++){
  for(let x=Math.max(0,Math.floor(view.left/size));x<=Math.min(world-1,Math.floor((view.left+view.width)/size));x++){
   const clip=document.createElement('div');clip.className='image-cell';
   Object.assign(clip.style,{left:Math.round(x*size-view.left)+'px',top:Math.round(y*size-view.top)+'px',width:size+'px',height:size+'px'});
   const img=new Image();img.alt='';img.draggable=false;clip.append(img);fragment.append(clip);
   function request(level){
    const scale=2**(sourceLevel-level),col=Math.floor(x/scale),row=Math.floor(y/scale);
    Object.assign(img.style,{width:size*scale+'px',height:size*scale+'px',left:-(x%scale)*size+'px',top:-(y%scale)*size+'px'});
    img.onerror=()=>{
     if(generation!==frameId)return;
     if(level>Math.max(0,sourceLevel-7)){request(level-1)}
     else {img.hidden=true;mapNotice('Imagem de fundo indisponível nesta área. As coordenadas e os limites podem ser consultados separadamente.')}
    };
    img.onload=()=>{
     if(generation===frameId&&level<sourceLevel)mapNotice('Parte da imagem está em resolução menor nesta área.');
    };
    img.src='https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/'+level+'/'+row+'/'+col+'?blankTile=false';
   }
   request(sourceLevel);
  }
 }
}
