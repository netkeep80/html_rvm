// Research only, PC1 B1-A. No production integration.
import { N,P,Key,Index,Role,sameEndpoint,sameLabel,createMOState,executeMO,serializeLosslessMO,deserializeLosslessMO,validateMOState } from '../../src/mo-core.js';
import { projectPlainJSON } from '../../src/mo-json.js';

const fail = code => { throw Error(code); };
const own = (v,k) => Object.hasOwn(v,k);
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const roleKeys = ['$obj','$rel','$sub'];
const prim = ['rmvm/version','json/meta','is_string','is_null','identity','where'];
const compare = (a,b) => a<b?-1:a>b?1:0;

// Raw grammar scan catches duplicate decoded object keys before JSON.parse.
export function parseStrict(source) {
  let i=0;
  const ws=()=>{while(i<source.length && /[ \t\r\n]/.test(source[i]))i++;};
  function string() {
    const re=/"(?:[^"\\\x00-\x1f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"/y;
    re.lastIndex=i;const m=re.exec(source);if(!m)fail('INVALID_JSON');
    i=re.lastIndex;return JSON.parse(m[0]);
  }
  function need(c){ws();if(source[i++]!==c)fail('INVALID_JSON');}
  function value(depth=0){
    if(depth>100)fail('DEPTH_LIMIT');ws();const c=source[i];
    if(c==='"'){string();return;}
    if(c==='{'){
      i++;ws();const seen=new Set();if(source[i]==='}'){i++;return;}
      while(true){ws();const k=string();if(seen.has(k))fail('DUPLICATE_KEY');seen.add(k);
        need(':');value(depth+1);ws();if(source[i]==='}'){i++;return;}need(',');}
    }
    if(c==='['){i++;ws();if(source[i]===']'){i++;return;}
      while(true){value(depth+1);ws();if(source[i]===']'){i++;return;}need(',');}}
    const re=/(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/y;
    re.lastIndex=i;const m=re.exec(source);if(!m)fail('INVALID_JSON');
    if(!['true','false','null'].includes(m[0])&&!Number.isFinite(Number(m[0])))fail('INVALID_NUMBER');
    i=re.lastIndex;
  }
  value();ws();if(i!==source.length)fail('INVALID_JSON');return JSON.parse(source);
}

export function complete(domains, compatible=()=>true) {
  const out=[];
  for(const o of domains.O)for(const r of domains.R)for(const s of domains.S)
    if(compatible(o,r,s))out.push({O:o,R:r,S:s});
  if(out.length!==1)fail(out.length?'AMBIGUOUS_COMPLETION':'NO_COMPLETION');
  return out[0];
}

function graph(state=createMOState()){
  let n=0,p=0;
  const transitions=[];
  const apply=action=>{
    const t=executeMO(state,action);
    if(t.outcome.status!=='OK')fail(t.outcome.diagnostic);
    state=t.state;transitions.push({action,outcome:t.outcome,persistence:t.persistence,born:t.born,dead:t.dead});
    return t.outcome.return;
  };
  function fresh(sort){
    let id;do{id=sort==='N'?'pc1n'+(++n):'pc1p'+(++p);}while(state.used[sort].has(id));return id;
  }
  const node=(kind,payload)=>apply({op:'createNode',id:fresh('N'),kind,payload});
  const edge=(owner,label,target=null)=>apply({op:'createRelation',id:fresh('P'),owner,label,target});
  const entity=(tag,extra={})=>node('entity',{tag,...extra});
  const children=(owner,kind)=>[...state.relations].filter(([,r])=>sameEndpoint(r.owner,owner)&&r.label.kind===kind);
  function relation(owner,label){
    const matches=children(owner,label.kind).filter(([,r])=>sameLabel(r.label,label));
    if(matches.length!==1)fail(matches.length?'AMBIGUOUS_LINK':'MISSING_LINK');return P(matches[0][0]);
  }
  function target(ref){
    if(ref?.sort!=='P')fail('EXPECTED_RELATION');
    const r=state.relations.get(ref.id);if(!r)fail('MISSING_LINK');
    if(!r.bound)fail('UNBOUND');return r.target;
  }
  const get=(owner,label)=>target(relation(owner,label));
  const link=(owner,name,target)=>edge(owner,Role(name),target);
  const role=(owner,name)=>get(owner,Role(name));
  const payload=ref=>{
    if(ref?.sort!=='N'||!state.nodes.has(ref.id))fail('MISSING_NODE');
    return state.nodes.get(ref.id).payload;
  };
  const tag=ref=>{
    if(ref?.sort!=='N'||state.nodes.get(ref.id)?.kind!=='entity')fail('EXPECTED_ENTITY');
    return payload(ref).tag;
  };
  function data(value){
    if(value===null)return node('null',null);
    if(Array.isArray(value)){const a=node('array');value.forEach((v,i)=>edge(a,Index(i),data(v)));return a;}
    if(object(value)){const a=node('object');for(const k of Object.keys(value).sort(compare))edge(a,Key(k),data(value[k]));return a;}
    return node(typeof value,value);
  }
  function read(ref){return projectPlainJSON(state,ref);}
  function bind(slot,value){return apply({op:'rebindRelation',id:slot.id,target:value});}
  return {get state(){return state;},transitions,apply,node,edge,entity,children,relation,target,get,link,role,payload,tag,data,read,bind};
}

// Environment metadata is an explicit graph input; no source or JS closure survives compile.
export function subjectivate(source,{profile='body',defaults='context',environment,definitions={}}={}){
  if(!['body','rose','data'].includes(profile)||!['context','structural'].includes(defaults))fail('PROFILE');
  const j=parseStrict(source),g=graph();
  const root=g.entity('program',{profile,defaults});
  const dict=g.entity('dictionary');g.link(root,'dictionary',dict);
  const env=g.entity('environment');g.link(root,'environment',env);
  if(!environment||typeof environment.version!=='string'||!own(environment,'meta'))fail('ENVIRONMENT');
  g.link(env,'version',g.data(environment.version));g.link(env,'meta',g.data(environment.meta));
  for(const name of prim)g.edge(dict,Key(name),g.entity('primitive',{name}));
  const defRef=name=>g.get(dict,Key(name));
  const term=(kind,extra={})=>g.entity('term',{kind,...extra});
  function operand(v){
    if(object(v)&&own(v,'$ref')){
      if(Object.keys(v).length!==1||!['$obj','capture'].includes(v.$ref))fail('REFERENCE_FORM');
      return term(v.$ref==='$obj'?'frameO':'capture');
    }
    const t=term('literal');g.link(t,'value',g.data(v));return t;
  }
  const defTerm=()=>term(defaults==='context'?'rho':'sourceSlot');
  function call(rel,o,s,mask){
    const e=g.entity('call',{mask});
    const t=complete({O:[o??defTerm()],R:[rel],S:[s??defTerm()]});
    for(const k of ['O','R','S'])g.link(e,k,t[k]);
    // A persistent source slot, different from the invocation result slot.
    g.link(e,'sourceSlot',g.edge(e,Role('sourceValue'),g.data(null)));
    return e;
  }
  function body(v){
    if(typeof v==='string')return call(defRef(v),null,null,2);
    if(Array.isArray(v)){
      const e=g.entity('family',{mode:'vector'});v.forEach((c,i)=>g.edge(e,Index(i),body(c)));return e;
    }
    if(!object(v))fail('BODY_TYPE');
    if(own(v,'$ref'))fail('BODY_REFERENCE_UNSUPPORTED');
    if(roleKeys.some(k=>own(v,k))){
      if(!own(v,'$rel')||Object.keys(v).some(k=>!roleKeys.includes(k))||typeof v.$rel!=='string')fail('ROLE_FORM');
      const o=own(v,'$obj')?operand(v.$obj):null;
      let s=null;
      if(own(v,'$sub')){
        if(v.$rel==='where'){s=term('body');g.link(s,'value',body(v.$sub));}
        else s=operand(v.$sub);
      }
      return call(defRef(v.$rel),o,s,(o?4:0)|2|(s?1:0));
    }
    const e=g.entity('family',{mode:'product'});
    for(const k of Object.keys(v).sort(compare))g.edge(e,Key(k),body(v[k]));
    return e;
  }
  // Definitions are explicit inputs, counted separately; no executable host function accepted.
  for(const [name,d] of Object.entries(definitions)){
    if(prim.includes(name))fail('DEFINITION_COLLISION');
    if(d.kind==='table'){
      if(!object(d.entries))fail('TABLE_FORM');
      const t=g.entity('table',{name});g.edge(dict,Key(name),t);
      for(const k of Object.keys(d.entries).sort(compare))g.edge(t,Key(k),g.data(d.entries[k]));
    }else if(d.kind==='closure'){
      const t=g.entity('closure',{name});g.edge(dict,Key(name),t);
      g.link(t,'capture',g.data(d.capture));g.link(t,'body',body(d.body));
    }else fail('DEFINITION_KIND');
  }
  let e;
  if(profile==='data'){
    e=g.entity('retain');g.link(e,'S',g.data(j));
  }else if(profile==='rose'){
    if(!object(j))fail('ROSE_FORM');
    const pairs=Object.entries(j);
    if(pairs.some(([,slot])=>typeof slot!=='string')||new Set(pairs.map(([,slot])=>slot)).size!==pairs.length)fail('SLOT_COLLISION');
    e=g.entity('family',{mode:'product'});
    for(const [name,slot] of pairs.sort((a,b)=>compare(a[1],b[1])))g.edge(e,Key(slot),call(defRef(name),null,null,2));
  }else e=body(j);
  g.link(root,'body',e);g.link(root,'result',g.edge(root,Role('resultValue'),null));
  g.apply({op:'setRoots',roots:[root]});
  return {state:g.state,root,transitions:g.transitions};
}

export function execute(state,{limit=500}={}){
  validateMOState(state);const g=graph(state),root=g.state.roots[0],events=[];
  let steps=0;const tick=()=>{if(++steps>limit)fail('EXEC_LIMIT');};
  const env=g.role(root,'environment');
  function readSlot(slot){return g.target(slot);}
  function termValue(t,frame,e){
    const k=g.payload(t).kind;
    if(k==='literal'||k==='body')return g.role(t,'value');
    if(k==='rho')return readSlot(frame.rho);
    if(k==='sourceSlot')return readSlot(g.role(e,'sourceSlot'));
    if(k==='frameO'){if(!frame.O)fail('UNBOUND_FRAME_O');return frame.O;}
    if(k==='capture'){if(!frame.capture)fail('UNBOUND_CAPTURE');return frame.capture;}
    fail('TERM_KIND');
  }
  function destination(t,frame,e){
    const k=g.payload(t).kind;
    if(k==='rho')return frame.rho;
    if(k==='sourceSlot')return g.role(e,'sourceSlot');
    fail('NOT_WRITABLE');
  }
  function makeSlot(owner,label){return g.edge(owner,label,null);}
  function invoke(e,frame){
    tick();const t=g.tag(e);
    if(t==='retain'){const v=g.role(e,'S');g.bind(frame.rho,v);return v;}
    if(t==='family'){
      const mode=g.payload(e).mode;
      if(mode==='vector'){
        let last=null;
        for(const [,r] of g.children(e,'index').sort((a,b)=>a[1].label.value-b[1].label.value))last=invoke(r.target,frame);
        return last;
      }
      if(mode!=='product')fail('FAMILY_MODE');
      const entries=g.children(e,'key').sort((a,b)=>compare(a[1].label.value,b[1].label.value));
      // Sufficient, intentionally conservative independence condition.
      for(const [,r] of entries){
        if(!r.bound||g.tag(r.target)!=='call')fail('PRODUCT_UNPROVED');
        const c=r.target,d=g.role(c,'R'),name=g.payload(d).name;
        if(g.payload(g.role(c,'S')).kind!=='rho')fail('PRODUCT_UNPROVED');
        const o=g.payload(g.role(c,'O')).kind;
        if(!['rmvm/version','json/meta'].includes(name)&&o!=='literal')fail('PRODUCT_UNPROVED');
        if(!['rmvm/version','json/meta','identity','is_string','is_null'].includes(name)||g.tag(d)!=='primitive')fail('PRODUCT_UNPROVED');
      }
      const a=g.node('object');
      for(const [,r] of entries){
        const slot=makeSlot(a,r.label);invoke(r.target,{...frame,rho:slot});
      }
      g.bind(frame.rho,a);return a;
    }
    if(t!=='call')fail('BODY_KIND');
    const d=g.role(e,'R'),o=g.role(e,'O'),s=g.role(e,'S'),name=g.payload(d).name;
    const kind=g.tag(d);let v;
    if(kind==='primitive'&&name==='rmvm/version')v=g.role(env,'version');
    else if(kind==='primitive'&&name==='json/meta')v=g.role(env,'meta');
    else if(kind==='primitive'&&name==='where'){
      const input=termValue(o,frame,e);
      const k=g.state.nodes.get(input.id)?.kind;
      if(k!=='array'&&k!=='null')fail('WHERE_ARRAY_REQUIRED');
      const predicate=termValue(s,frame,e),out=g.node('array');
      let i=0;
      for(const [,r] of g.children(input,'index').sort((a,b)=>a[1].label.value-b[1].label.value)){
        const slot=makeSlot(g.entity('predicate-frame'),Role('rho'));
        const result=invoke(predicate,{...frame,O:r.target,rho:slot});
        if(g.read(result)===true)g.edge(out,Index(i++),r.target);
      }
      v=out;g.bind(frame.rho,v);
    }else if(kind==='primitive'){
      const input=termValue(o,frame,e);
      if(name==='identity')v=input;
      else if(name==='is_string'||name==='is_null')v=g.data(g.state.nodes.get(input.id)?.kind===(name==='is_string'?'string':'null'));
      else fail('UNKNOWN_CONTROLLER');
    }else if(kind==='table'){
      const key=g.read(termValue(o,frame,e));if(typeof key!=='string')fail('TABLE_KEY_TYPE');
      v=g.get(d,Key(key));
    }else if(kind==='closure'){
      const input=termValue(o,frame,e),slot=makeSlot(g.entity('closure-frame'),Role('rho'));
      v=invoke(g.role(d,'body'),{O:input,rho:slot,capture:g.role(d,'capture')});
    }else fail('CONTROLLER_KIND');
    if(name!=='where'||kind!=='primitive')g.bind(destination(s,frame,e),v);
    events.push({E:e.id,R:d.id,name,result:g.read(v)});
    return v;
  }
  const slot=g.role(root,'result'),body=g.role(root,'body');
  // DATA projection has no execution events; return original state unchanged.
  if(g.tag(body)==='retain')return {state,result:g.read(g.role(body,'S')),events,transitions:[]};
  const frame={rho:slot,O:null,capture:null};
  // Top-level vector commits each completed child independently. A failing child
  // cannot publish tentative graph changes or events; later children are not run.
  if(g.tag(body)==='family'&&g.payload(body).mode==='vector'){
    let last=null;
    for(const [,r] of g.children(body,'index').sort((a,b)=>a[1].label.value-b[1].label.value)){
      const before=g.state,eventCount=events.length,transitionCount=g.transitions.length;
      try{last=invoke(r.target,frame);}
      catch(error){return {state:before,result:null,committedResult:last?projectPlainJSON(before,last):null,
        events:events.slice(0,eventCount),transitions:g.transitions.slice(0,transitionCount),diagnostic:error.message};}
    }
    return {state:g.state,result:last?g.read(last):null,events,transitions:g.transitions};
  }
  try {
    const v=invoke(body,frame);
    return {state:g.state,result:v?g.read(v):null,events,transitions:g.transitions};
  }catch(error){
    // One non-vector invocation is a bounded atomic attempt in this prototype.
    return {state,result:null,events:[],transitions:[],diagnostic:error.message};
  }
}

export function objectivate(state){
  const g=graph(state),root=state.roots[0],p=g.payload(root).profile;
  function operand(t){
    const k=g.payload(t).kind;
    if(k==='literal')return g.read(g.role(t,'value'));
    if(k==='frameO'||k==='capture')return {$ref:k==='frameO'?'$obj':'capture'};
    if(k==='body')return body(g.role(t,'value'));
    fail('TERM_PROJECTION');
  }
  function body(e){
    const t=g.tag(e);
    if(t==='retain')return g.read(g.role(e,'S'));
    if(t==='family'){
      if(g.payload(e).mode==='vector')return g.children(e,'index').sort((a,b)=>a[1].label.value-b[1].label.value).map(([,r])=>body(r.target));
      return Object.fromEntries(g.children(e,'key').sort((a,b)=>compare(a[1].label.value,b[1].label.value)).map(([,r])=>[r.label.value,body(r.target)]));
    }
    if(t!=='call')fail('BODY_PROJECTION');
    const m=g.payload(e).mask,name=g.payload(g.role(e,'R')).name;
    if(m===2)return name;
    const v={$rel:name};
    if(m&4)v.$obj=operand(g.role(e,'O'));
    if(m&1)v.$sub=operand(g.role(e,'S'));
    return v;
  }
  const e=g.role(root,'body');
  if(p==='rose'){
    const entries=g.children(e,'key').map(([,r])=>[g.payload(g.role(r.target,'R')).name,r.label.value]);
    if(new Set(entries.map(([k])=>k)).size!==entries.length)fail('ROSE_CONFLICT');
    return Object.fromEntries(entries);
  }
  return body(e);
}

export function detached(state){return deserializeLosslessMO(JSON.parse(serializeLosslessMO(state)));}
