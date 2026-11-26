// View-only SVG graph; all semantic writes go through the Studio session.
const NS="http://www.w3.org/2000/svg";
const key=e=>JSON.stringify([e.sort,e.id]);
const equal=(a,b)=>a&&b&&key(a)===key(b);
const ep=(sort,id)=>({sort,id});
const $=id=>document.getElementById(id);
const svgEl=(tag,attrs={},text)=>{const el=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,v);if(text!==undefined)el.textContent=text;return el;};
const short=s=>s.length>20?s.slice(0,19)+"…":s;
const fmt=e=>e?e.sort+":"+e.id:"∅";
const options=(el,items)=>{el.replaceChildren(...items.map(k=>{const o=document.createElement("option");o.value=k;o.textContent=k;return o;}));};
export function freshVisualId(state,sort){let i=1;const prefix=sort==="N"?"n":"p";while(state.used[sort].has(prefix+i))i++;return prefix+i;}
export function visualRecords(state){return [...state.nodes].map(([id,r])=>({sort:"N",id,record:r})).concat([...state.relations].map(([id,r])=>({sort:"P",id,record:r})));}

export function mountVisualGraph({studio,getSelected,select,run}){
 const svg=$("mo-graph"),layer=$("graph-layer"),positions=new Map();
 let camera={x:0,y:0,z:1}, gesture=null, mode="select";
 const records=()=>visualRecords(studio.state);
 const lookup=e=>e&&(e.sort==="N"?studio.state.nodes:studio.state.relations).get(e.id);
 function autoLayout(){positions.clear();const counts={N:0,P:0};for(const e of records()){const i=counts[e.sort]++;positions.set(key(e),{x:(e.sort==="N"?120:360)+Math.floor(i/5)*480,y:75+(i%5)*115});}}
 function placeMissing(){const live=new Set(records().map(key));for(const k of positions.keys())if(!live.has(k))positions.delete(k);for(const e of records())if(!positions.has(key(e))){let i=0,p;do{p={x:(e.sort==="N"?120:360)+Math.floor(i/5)*480,y:75+(i%5)*115};i++;}while([...positions.values()].some(q=>Math.abs(q.x-p.x)<100&&Math.abs(q.y-p.y)<85));positions.set(key(e),p);}}
 function point(event){const p=new DOMPoint(event.clientX,event.clientY).matrixTransform(svg.getScreenCTM().inverse());return {x:(p.x-camera.x)/camera.z,y:(p.y-camera.y)/camera.z};}
 function screenPoint(event){return new DOMPoint(event.clientX,event.clientY).matrixTransform(svg.getScreenCTM().inverse());}
 function text(parent,x,y,value,cls=""){parent.append(svgEl("text",{x,y,class:cls,"text-anchor":"middle","pointer-events":"none"},value));}
 function port(parent,x,y,type){parent.append(svgEl("circle",{cx:x,cy:y,r:8,class:"mo-port "+type,"data-port":type}));}
 function edge(a,b,kind,offset=0){if(!a||!b)return;let d;if(a===b){d="M "+(a.x+28)+" "+(a.y-24)+" C "+(a.x+100)+" "+(a.y-90)+" "+(a.x+100)+" "+(a.y+90)+" "+(a.x+28)+" "+(a.y+24);}else{const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1,ux=dx/len,uy=dy/len;const sx=a.x+ux*46,sy=a.y+uy*31,ex=b.x-ux*46,ey=b.y-uy*31;d="M "+sx+" "+sy+" Q "+((sx+ex)/2-uy*offset)+" "+((sy+ey)/2+ux*offset)+" "+ex+" "+ey;}layer.append(svgEl("path",{d,class:"mo-incidence "+kind,"marker-end":"url(#mo-arrow-"+kind+")"}));}
 function draw(){placeMissing();layer.setAttribute("transform","translate("+camera.x+" "+camera.y+") scale("+camera.z+")");layer.replaceChildren();
  for(const [id,r] of studio.state.relations){const p=positions.get(key(ep("P",id)));edge(positions.get(key(r.owner)),p,"owner",20);if(r.bound)edge(p,positions.get(key(r.target)),"target",20);else{layer.append(svgEl("path",{d:"M "+(p.x+40)+" "+p.y+" h 44",class:"mo-incidence unbound"}));text(layer,p.x+96,p.y+5,"∅","mo-unbound");}}
  for(const e of records()){const p=positions.get(key(e)),r=e.record,g=svgEl("g",{transform:"translate("+p.x+" "+p.y+")",class:"mo-glyph "+(e.sort==="N"?"node":"relation")+(equal(e,getSelected())?" active":""),"data-key":key(e),tabindex:"0",role:"button","aria-label":fmt(e)});
   const roots=studio.state.roots.map((root,i)=>equal(root,e)?i+1:0).filter(Boolean);
   const refs=[...studio.state.relations.values()].filter(v=>v.bound&&equal(v.target,e)).length;
   g.append(svgEl("title",{},fmt(e)+" "+JSON.stringify(r)));
   g.append(e.sort==="N"?svgEl("rect",{x:-48,y:-29,width:96,height:58,rx:10,class:"mo-shape"}):svgEl("path",{d:"M 0 -34 L 50 0 L 0 34 L -50 0 Z",class:"mo-shape"}));
   text(g,0,-4,short(fmt(e)),"mo-id");text(g,0,13,short(e.sort==="N"?(r.kind+(r.payload===null?"":" "+JSON.stringify(r.payload))):r.label.kind+":"+r.label.value),"mo-detail");
   if(roots.length)text(g,0,-43,"ROOT "+roots.join(","),"mo-root");if(refs>1)text(g,0,47,"sharing ×"+refs,"mo-sharing");
   port(g,0, e.sort==="N"?29:34,"create");
   if(e.sort==="P"){port(g,-50,0,"owner");port(g,50,0,"target");}
   layer.append(g);
  }
  if(gesture?.type==="link"){const p=positions.get(key(gesture.from));if(p&&gesture.to)layer.append(svgEl("path",{d:"M "+p.x+" "+p.y+" L "+gesture.to.x+" "+gesture.to.y,class:"mo-preview"}));}
 }
 function fromElement(el){const g=el?.closest?.("[data-key]");if(!g)return null;const [sort,id]=JSON.parse(g.dataset.key);return ep(sort,id);}
 function label(kind,value){return {kind,value:kind==="index"?Number(value):value};}
 function create(owner,target){run(()=>studio.action({op:"createRelation",id:freshVisualId(studio.state,"P"),owner,label:label($("graph-label-kind").value,$("graph-label-value").value),target}));}
 function changeLink(g,target){if(g.port==="create")create(g.from,target);else run(()=>studio.action(g.port==="owner"?{op:"moveRelation",id:g.from.id,owner:target}:{op:"rebindRelation",id:g.from.id,target}));}
 svg.addEventListener("pointerdown",e=>{if(e.button!==0&&e.button!==1)return;e.preventDefault();const hit=fromElement(e.target),port=e.target.getAttribute("data-port"),p=point(e);
  if(e.button===0&&hit&&mode!=="pan"){if(port){gesture={type:"link",port,from:hit,to:p};}else{gesture={type:"move",from:hit,start:p,origin:{...positions.get(key(hit))}};select(hit);}}
  else{gesture={type:"pan",start:screenPoint(e),origin:{...camera}};}
  svg.setPointerCapture(e.pointerId);draw();
 });
 svg.addEventListener("pointermove",e=>{if(!gesture)return;if(gesture.type==="move"){const p=point(e);positions.set(key(gesture.from),{x:gesture.origin.x+p.x-gesture.start.x,y:gesture.origin.y+p.y-gesture.start.y});}else if(gesture.type==="pan"){const p=screenPoint(e);camera.x=gesture.origin.x+p.x-gesture.start.x;camera.y=gesture.origin.y+p.y-gesture.start.y;}else gesture.to=point(e);draw();});
 svg.addEventListener("pointerup",e=>{const g=gesture;gesture=null;if(svg.hasPointerCapture(e.pointerId))svg.releasePointerCapture(e.pointerId);if(g?.type==="link"){const target=fromElement(document.elementFromPoint(e.clientX,e.clientY));if(target&&lookup(target))changeLink(g,target);}draw();});
 svg.addEventListener("pointercancel",()=>{gesture=null;draw();});svg.addEventListener("lostpointercapture",()=>{gesture=null;draw();});
 function zoom(f,at={x:450,y:280}){const z=Math.max(.25,Math.min(4,camera.z*f));camera.x=at.x-(at.x-camera.x)*z/camera.z;camera.y=at.y-(at.y-camera.y)*z/camera.z;camera.z=z;draw();}
 svg.addEventListener("wheel",e=>{e.preventDefault();zoom(e.deltaY<0?1.15:1/1.15,screenPoint(e));},{passive:false});
 svg.addEventListener("keydown",e=>{if(e.key==="Escape"){gesture=null;draw();}if(e.key==="Enter"||e.key===" "){const hit=fromElement(e.target);if(hit){e.preventDefault();select(hit);}}});
 document.addEventListener("keydown",e=>{if(e.key==="Escape"&&gesture){gesture=null;draw();}});
 $("graph-mode").onchange=e=>{mode=e.target.value;};$("graph-zoom-in").onclick=()=>zoom(1.25);$("graph-zoom-out").onclick=()=>zoom(.8);
 $("graph-layout").onclick=()=>{autoLayout();camera={x:0,y:0,z:1};draw();};
 options($("graph-node-kind"),["entity","object","array","string","number","boolean","null"]);options($("graph-label-kind"),["role","key","index","tag"]);
 function payload(kind,raw){if(["null","object","array"].includes(kind))return null;if(kind==="string")return raw;if(kind==="number"){if(raw.trim()==="")throw Error("Введите число");return Number(raw);}if(kind==="boolean"){if(raw!=="true"&&raw!=="false")throw Error("Введите true или false");return raw==="true";}return raw.trim()===""?null:JSON.parse(raw);}
 $("graph-create-node").onclick=()=>run(()=>{const kind=$("graph-node-kind").value,id=freshVisualId(studio.state,"N");return studio.action({op:"createNode",id,kind,payload:payload(kind,$("graph-node-payload").value)});});
 $("graph-create-unbound").onclick=()=>{const e=getSelected();if(lookup(e))create(e,null);};
 $("graph-delete").onclick=()=>{const e=getSelected();if(lookup(e))run(()=>studio.action({op:e.sort==="N"?"deleteNode":"deleteRelation",id:e.id}));};
 $("graph-unbind").onclick=()=>{const e=getSelected();if(e?.sort==="P")run(()=>studio.action({op:"rebindRelation",id:e.id,target:null}));};
 $("graph-root").onclick=()=>{const e=getSelected();if(!lookup(e))return;const roots=studio.state.roots;run(()=>studio.action({op:"setRoots",roots:roots.some(r=>equal(r,e))?roots.filter(r=>!equal(r,e)):[...roots,e]}));};
 $("graph-save").onclick=()=>run(()=>{const e=getSelected();if(!lookup(e))throw Error("Выберите объект");const kind=$("graph-edit-kind").value,value=$("graph-edit-value").value;return studio.action(e.sort==="N"?{op:"setNode",id:e.id,kind,payload:payload(kind,value)}:{op:"relabelRelation",id:e.id,label:label(kind,value)});});
 function inspector(){const e=getSelected(),r=lookup(e);$("graph-selected").textContent=r?fmt(e):"Выберите N или P";for(const id of ["graph-delete","graph-root","graph-save","graph-create-unbound","graph-edit-kind","graph-edit-value"])$(id).disabled=!r;$("graph-unbind").disabled=!r||e.sort!=="P";if(!r){$("graph-edit-kind").replaceChildren();$("graph-edit-value").value="";return;}
  const isN=e.sort==="N";options($("graph-edit-kind"),isN?["entity","object","array","string","number","boolean","null"]:["role","key","index","tag"]);$("graph-edit-kind").value=isN?r.kind:r.label.kind;$("graph-edit-value").value=isN?(r.kind==="string"?r.payload:r.payload===null?"":JSON.stringify(r.payload)):String(r.label.value);$("graph-root").textContent=studio.state.roots.some(x=>equal(x,e))?"Убрать корень":"Добавить корень";
 }
 autoLayout();return {render(){draw();inspector();},reset(){gesture=null;autoLayout();camera={x:0,y:0,z:1};}};
}
