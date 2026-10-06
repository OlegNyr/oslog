  // ---------- field extraction (tolerant to schema variations) ----------
  function pick(o, paths){
    for(var i=0;i<paths.length;i++){
      var parts=paths[i].split("."), v=o, ok=true;
      for(var j=0;j<parts.length;j++){ if(v&&typeof v==="object"&&parts[j] in v){v=v[parts[j]];}else{ok=false;break;} }
      if(ok && v!==undefined && v!==null) return v;
    }
    return undefined;
  }
  function norm(raw, lineNo){
    var o;
    try{ o=JSON.parse(raw); }catch(e){ return {raw:raw,parsed:null,level:"RAW",msg:raw,ts:"",tsMs:NaN,logger:"",thread:"",seq:lineNo}; }
    if(typeof o!=="object"||o===null) return {raw:raw,parsed:null,level:"RAW",msg:String(o),ts:"",tsMs:NaN,logger:"",thread:"",seq:lineNo};
    var lvl = String(pick(o,["level","log.level","severity"])||"INFO").toUpperCase();
    if(LEVEL_ORDER.indexOf(lvl)<0) lvl = (lvl==="WARNING"?"WARN":"INFO");
    var ts  = pick(o,["@timestamp","timestamp","time","ts"]) || "";
    var tsMs = ts? Date.parse(ts) : NaN;
    var logger = pick(o,["logger","logger_name","log.logger"]) || "";
    var thread = pick(o,["process.thread.name","thread.name","thread_name","thread"]) || "";
    var msg = pick(o,["message","msg"]); if(msg===undefined) msg="";
    return {
      raw:raw, parsed:o, level:lvl, msg:String(msg), ts:String(ts), tsMs:tsMs,
      logger:String(logger), thread:String(thread),
      seq: (o.sequenceNumber!==undefined? o.sequenceNumber : lineNo),
      traceId: pick(o,["traceId","trace.id","trace_id"]),
      spanId: pick(o,["spanId","span.id","span_id"]),
      // logbook exchange context — MDC fields are flat at root (correlation/origin/operation),
      // url/duration arrive as KeyValuePairs (stringified, so duration is a string like "58").
      correlation: pick(o,["correlation"]),
      origin: pick(o,["origin"]),
      operation: pick(o,["operation"]),
      url: pick(o,["url"]),
      duration: pick(o,["duration"]),
      hasErr: !!(o.error || lvl==="ERROR"),
      // precomputed lowercase haystack for fast substring search
      hay: raw.toLowerCase()
    };
  }
