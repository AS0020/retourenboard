// Bind a successful preview to the exact inputs that were checked.
export function createImportSession() {
  let revision=0, acceptedPayload=null;
  return {
    invalidate(){revision++;acceptedPayload=null;},
    begin(payload){revision++;acceptedPayload=null;return Object.freeze({revision,serialized:JSON.stringify(payload)});},
    accept(request,result){
      if(request.revision!==revision)return false;
      acceptedPayload=result.errors.length===0&&result.rows.length>0?request.serialized:null;
      return true;
    },
    getCommitPayload(){return acceptedPayload===null?null:JSON.parse(acceptedPayload);}
  };
}
