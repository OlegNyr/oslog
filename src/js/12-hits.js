  // ---------- OpenSearch hits -> records ----------
  // hit (from osApi.search): {key, ts (ingest ms), msg (the original ndjson line), k8s:{app,pod,namespace,container,node,cluster}}
  function hitToRecord(h, n){
    var r=norm(h.msg, n);
    if(isNaN(r.tsMs)){ r.tsMs=h.ts; r.ts=isNaN(h.ts)? "" : new Date(h.ts).toISOString(); } // RAW (Spring banner etc.): hit time
    r.k8s=h.k8s||{};
    if(r.parsed && typeof r.parsed==="object" && !("k8s" in r.parsed)) r.parsed.k8s=r.k8s;
    r.hay=(r.hay||String(r.raw).toLowerCase())+" "+String(r.k8s.app||"").toLowerCase()+" "+String(r.k8s.pod||"").toLowerCase();
    return r;
  }
  // log time, then sequenceNumber (per pod), then arrival order
  function hitsToRecords(hits){
    var recs=hits.map(function(h,i){ var r=hitToRecord(h, i+1); r._ord=i; return r; });
    recs.sort(function(a,b){
      if(a.tsMs!==b.tsMs) return a.tsMs-b.tsMs;
      var sa=Number(a.seq), sb=Number(b.seq);
      if(sa!==sb && !isNaN(sa) && !isNaN(sb)) return sa-sb;
      return b._ord-a._ord; // hits arrive newest first
    });
    return recs;
  }
