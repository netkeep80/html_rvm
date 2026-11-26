import test from 'node:test';
import assert from 'node:assert/strict';
import {subjectivate,execute,objectivate,detached,parseStrict,complete} from '../research/pc1/graph-executor.mjs';
import {N,P,Key,Role,executeMO,serializeLosslessMO,jsonEqual} from '../src/mo-core.js';

// Independent supplied test input, not a version literal in the executor.
const environment={version:'01.13',meta:{engine:'html-rvm',profile:'pc1-b1'}};
const equal=(a,b)=>assert.ok(jsonEqual(a,b),JSON.stringify({actual:a,expected:b}));
const oldWhere={$obj:[null,2,false,'4',{}],$rel:'where',$sub:{$obj:{$ref:'$obj'},$rel:'is_string'}};
const compactWhere={where:[[null,2,false,'4',{}],{is_string:[{$ref:'$obj'}]}]};
function run(j,opts={}){
  const c=subjectivate(JSON.stringify(j),{environment,...opts});
  const state=detached(c.state);assert.equal(serializeLosslessMO(c.state),serializeLosslessMO(state));
  return {c,state,x:execute(state)};
}
function ok(x){assert.equal(x.diagnostic,undefined);}
const calls=x=>x.events.map(e=>[e.name,e.result]);
const role=(state,owner,name)=>[...state.relations].find(([,r])=>r.owner.id===owner.id&&r.owner.sort===owner.sort&&r.label.kind==='role'&&r.label.value===name);
test('PC1 W01 rose and explicit body: detached, two independent result slots',()=>{
  const a=run({'rmvm/version':'rmvm_version','json/meta':'meta'},{profile:'rose'});
  const b=run({rmvm_version:'rmvm/version',meta:'json/meta'});
  const expected={rmvm_version:environment.version,meta:environment.meta};
  for(const q of [a,b]){ok(q.x);equal(q.x.result,expected);assert.equal(q.x.events.length,2);}
  equal(objectivate(a.state),{'rmvm/version':'rmvm_version','json/meta':'meta'});
  equal(objectivate(b.state),{rmvm_version:'rmvm/version',meta:'json/meta'});
});
test('PC1 W02 explicit and relation-first: same graph body and actual outcomes',()=>{
  const a=run(oldWhere),b=run(compactWhere,{profile:'relation-first'});
  for(const q of [a,b]){ok(q.x);equal(q.x.result,['4']);equal(q.x.events.filter(e=>e.name==='is_string').map(e=>e.result),[false,false,false,true,false]);}
  equal(calls(a.x),calls(b.x));
  assert.equal(a.state.nodes.size,b.state.nodes.size);assert.equal(a.state.relations.size,b.state.relations.size);
  equal(objectivate(a.state),oldWhere);equal(objectivate(b.state),compactWhere);
  const rebuilt=run(objectivate(b.state),{profile:'relation-first'});equal(calls(rebuilt.x),calls(b.x));
});
test('PC1 W02 independent predicate and edge inputs',()=>{
  for(const [items,predicate,expected] of [[[], 'is_string',[]],[null,'is_string',[]],[[null,2,'4'],'is_null',[null]],[['a',1,'b'],'is_string',['a','b']]]){
    const a=run({$obj:items,$rel:'where',$sub:{$obj:{$ref:'$obj'},$rel:predicate}});
    ok(a.x);equal(a.x.result,expected);
    const b=run({where:[items,{[predicate]:[{$ref:'$obj'}]}]},{profile:'relation-first'});
    ok(b.x);equal(calls(a.x),calls(b.x));
  }
});
test('PC1 W02 error: atomic non-vector attempt has no committed changes',()=>{
  const {state,x}=run({$obj:7,$rel:'where',$sub:{$obj:{$ref:'$obj'},$rel:'is_string'}});
  assert.equal(x.diagnostic,'WHERE_ARRAY_REQUIRED');assert.equal(x.events.length,0);assert.equal(x.transitions.length,0);
  assert.equal(serializeLosslessMO(x.state),serializeLosslessMO(state));
});
test('PC1 W03 rebind operand P, preserve identity and read modified graph',()=>{
  const {state,x}=run({$obj:'a',$rel:'identity'});ok(x);assert.equal(x.result,'a');
  const body=role(state,state.roots[0],'body')[1].target;
  const op=role(state,body,'O')[1].target;
  const [id]=role(state,op,'value');
  const fresh=executeMO(state,{op:'createNode',id:'b',kind:'string',payload:'b'});
  const rb=executeMO(fresh.state,{op:'rebindRelation',id,target:N('b')});
  assert.equal(rb.outcome.status,'OK');assert.ok(rb.persistence.P.some(([a,b])=>a===id&&b===id));
  assert.equal(execute(detached(rb.state)).result,'b');
  const bad=executeMO(rb.state,{op:'rebindRelation',id,target:N('missing')});
  assert.equal(bad.outcome.diagnostic,'MISSING_TARGET');assert.equal(serializeLosslessMO(bad.state),serializeLosslessMO(rb.state));
  const unbind=executeMO(rb.state,{op:'rebindRelation',id,target:null});
  assert.equal(execute(unbind.state).diagnostic,'UNBOUND');
});
test('PC1 W03 shared target mutation differs from single P rebind',()=>{
  const {state}=run({$obj:'a',$rel:'identity'});
  const body=role(state,state.roots[0],'body')[1].target;
  const op=role(state,body,'O')[1].target;
  const [id,r]=role(state,op,'value'),a=r.target;
  const alias=executeMO(state,{op:'createRelation',id:'alias',owner:op,label:Role('alias'),target:a});
  const mutate=executeMO(alias.state,{op:'setNode',id:a.id,kind:'string',payload:'changed'});
  assert.equal(execute(mutate.state).result,'changed');
  assert.equal(mutate.state.nodes.get(mutate.state.relations.get('alias').target.id).payload,'changed');
  const fresh=executeMO(mutate.state,{op:'createNode',id:'b',kind:'string',payload:'b'});
  const rb=executeMO(fresh.state,{op:'rebindRelation',id,target:N('b')});
  assert.equal(execute(rb.state).result,'b');
  assert.equal(rb.state.nodes.get(rb.state.relations.get('alias').target.id).payload,'changed');
});
test('PC1 W04 DATA reserved keys and no execution',()=>{
  const j={$rel:'is_string',$ref:'x',nested:[null,{$obj:0}]};const {state,x}=run(j,{profile:'data'});
  equal(x.result,j);equal(objectivate(state),j);assert.equal(x.events.length,0);
  assert.equal(serializeLosslessMO(state),serializeLosslessMO(x.state));
});
test('PC1 W04 vector repeated uses retain distinct occurrence IDs and same definition',()=>{
  const j=[{$obj:'a',$rel:'identity'},{$obj:'a',$rel:'identity'}];
  const {x}=run(j);ok(x);assert.equal(x.events.length,2);
  assert.notEqual(x.events[0].E,x.events[1].E);assert.equal(x.events[0].R,x.events[1].R);
  const d=run(j,{profile:'data'});assert.equal(d.x.events.length,0);equal(d.x.result,j);
});
test('PC1 W04 vector failure preserves completed prefix and stops',()=>{
  const {x}=run([{$obj:'a',$rel:'identity'},{$obj:'x',$rel:'where',$sub:{$obj:{$ref:'$obj'},$rel:'is_string'}},{$obj:'b',$rel:'identity'}]);
  assert.equal(x.diagnostic,'WHERE_ARRAY_REQUIRED');assert.equal(x.committedResult,'a');
  equal(calls(x),[['identity','a']]);assert.equal(x.transitions.length,1);
});
test('PC1 W04 invalid source duplicate decoded keys and ambiguous completion',()=>{
  assert.throws(()=>parseStrict('{"a":1,"\\u0061":2}'),/DUPLICATE_KEY/);
  assert.throws(()=>parseStrict('{"a":1,}'),/INVALID_JSON/);
  assert.throws(()=>complete({O:[0,1],R:[0],S:[0,1]},(o,r,s)=>o===s),/AMBIGUOUS_COMPLETION/);
  assert.throws(()=>complete({O:[],R:[0],S:[0]}),/NO_COMPLETION/);
  equal(complete({O:[null],R:[0],S:['']}),{O:null,R:0,S:''});
});
test('PC1 W04 independent product accepted, unproved cross-child dependence rejected',()=>{
  const x=run({a:{$obj:'a',$rel:'identity'},b:{$obj:'b',$rel:'identity'}}).x;
  ok(x);equal(x.result,{a:'a',b:'b'});assert.equal(x.events.length,2);
  const bad=run({a:{$obj:'a',$rel:'identity'},b:'identity'});
  assert.equal(bad.x.diagnostic,'PRODUCT_UNPROVED');assert.equal(serializeLosslessMO(bad.state),serializeLosslessMO(bad.x.state));
});
test('PC1 W05 reuse definition and explicit captured binding',()=>{
  const {x}=run([{$obj:'a',$rel:'f'},{$obj:'b',$rel:'f'}],{definitions:{f:{kind:'closure',capture:'captured',body:{$obj:{$ref:'capture'},$rel:'identity'}}}});
  ok(x);const f=x.events.filter(e=>e.name==='f');equal(f.map(e=>e.result),['captured','captured']);
  assert.equal(f[0].R,f[1].R);assert.notEqual(f[0].E,f[1].E);
});
test('PC1 W05 table lookup uses explicit graph definition, missing and duplicate rejected',()=>{
  const definitions={not:{kind:'table',entries:{'0':'1','1':'0'}}};
  for(const [key,value] of [['0','1'],['1','0']]){const {x}=run({$obj:key,$rel:'not'},{definitions});ok(x);assert.equal(x.result,value);}
  const bad=run({$obj:'2',$rel:'not'},{definitions});assert.equal(bad.x.diagnostic,'MISSING_LINK');assert.equal(serializeLosslessMO(bad.state),serializeLosslessMO(bad.x.state));
  assert.throws(()=>subjectivate('{"rmvm/version":"a","json/meta":"a"}',{profile:'rose',environment}),/SLOT_COLLISION/);
});
test('PC1 contextual and structural defaults are different graph terms',()=>{
  const a=run('rmvm/version'),b=run('rmvm/version',{defaults:'structural'});
  const bodyA=role(a.state,a.state.roots[0],'body')[1].target,bodyB=role(b.state,b.state.roots[0],'body')[1].target;
  const oA=role(a.state,bodyA,'O')[1].target,oB=role(b.state,bodyB,'O')[1].target;
  assert.equal(a.state.nodes.get(oA.id).payload.kind,'rho');assert.equal(b.state.nodes.get(oB.id).payload.kind,'sourceSlot');
  assert.equal(a.x.result,environment.version);assert.equal(b.x.result,environment.version);
  assert.notEqual(serializeLosslessMO(a.x.state),serializeLosslessMO(b.x.state));
});

test('PC1 exact pre-execution package image includes definitions and environment',()=>{
  const cases=[
    [oldWhere,{}],[compactWhere,{profile:'relation-first'}],
    [{'rmvm/version':'rmvm_version','json/meta':'meta'},{profile:'rose'}],
    [{$rel:'identity',$obj:{$ref:'capture'}},{definitions:{f:{kind:'closure',capture:'captured',body:{$obj:{$ref:'capture'},$rel:'identity'}}}}],
    [{$rel:'not',$obj:'0'},{definitions:{not:{kind:'table',entries:{'0':'1','1':'0'}}}}],
    [{$ref:'x',$rel:'literal'},{profile:'data'}]
  ];
  for(const [j,opts] of cases){
    const {state}=run(j,opts),pack=objectivate(state,{packageImage:true});
    const rebuilt=subjectivate(JSON.stringify(pack.source),pack);
    assert.equal(serializeLosslessMO(rebuilt.state),serializeLosslessMO(state));
  }
  const {x}=run(oldWhere);
  assert.throws(()=>objectivate(x.state,{packageImage:true}),/OUTSIDE_CANONICAL_PACKAGE_IMAGE/);
});
test('PC1 completion deduplicates only identical typed endpoints',()=>{
  equal(complete({O:[N('a'),N('a')],R:[N('r')],S:[null]}),{O:N('a'),R:N('r'),S:null});
  assert.throws(()=>complete({O:[N('a'),P('a')],R:[N('r')],S:[null]}),/AMBIGUOUS_COMPLETION/);
});
test('PC1 contextual/structural default changes destination, not merely source tag',()=>{
  const a=run('rmvm/version'),b=run('rmvm/version',{defaults:'structural'});
  const aSlot=role(a.state,a.state.roots[0],'result')[1].target;
  const bSlot=role(b.state,b.state.roots[0],'result')[1].target;
  assert.equal(a.x.state.relations.get(aSlot.id).bound,true);
  assert.equal(b.x.state.relations.get(bSlot.id).bound,false);
  const bBody=role(b.state,b.state.roots[0],'body')[1].target;
  const sourceSlot=role(b.state,bBody,'sourceSlot')[1].target;
  assert.equal(b.x.state.nodes.get(b.x.state.relations.get(sourceSlot.id).target.id).payload,environment.version);
});
