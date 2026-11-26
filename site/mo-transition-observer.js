const copy=value=>value===undefined?undefined:structuredClone(value);

export function transitionObservation(transition,meta={}){
 if(!transition||typeof transition!=="object"||!transition.outcome)throw Error("TRANSITION_REQUIRED");
 return {
  source:typeof meta.source==="string"&&meta.source?meta.source:"runtime",
  action:meta.action===undefined?null:copy(meta.action),
  committed:transition.outcome.status==="OK",
  pi:copy(transition.persistence??{N:[],P:[]}),
  omega:copy(transition.outcome),
  born:copy(transition.born??{N:[],P:[]}),
  dead:copy(transition.dead??{N:[],P:[]}),
  trace:transition.trace===undefined?null:copy(transition.trace)
 };
}

export function createTransitionObserver(limit=32){
 if(!Number.isSafeInteger(limit)||limit<1)throw Error("OBSERVER_LIMIT");
 let last=null,history=[],sequence=0;
 const snapshot=()=>({last:copy(last),history:copy(history)});
 return {
  get last(){return copy(last);},
  get history(){return copy(history);},
  observe(transition,meta={}){
   if(transition?.session===true){last=null;history=[];sequence=0;return snapshot();}
   const observation=transitionObservation(transition,meta);
   last=observation;
   if(observation.committed){
    history.push({seq:++sequence,...copy(observation)});
    if(history.length>limit)history=history.slice(-limit);
   }
   return snapshot();
  },
  reset(){last=null;history=[];sequence=0;return snapshot();}
 };
}
