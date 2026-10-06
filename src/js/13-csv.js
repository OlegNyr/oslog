  // ---------- CSV export from OpenSearch Dashboards ----------
  // Each row's `message` column is the original ndjson line; optional k8s
  // columns (pod_labels.app, pod, …) and @timestamp come along. Rows become
  // hits ({key, ts, msg, k8s}) for hitsToRecords(), like an OpenSearch search.
  // Tolerant to Dashboards settings: quoted or bare values, "," ";" or tab,
  // BOM, newlines inside values, formula escaping ('=… '@…).
  var CSV_K8S={ "pod_labels.app":"app", "pod":"pod", "namespace":"namespace", "container":"container", "node":"node", "k8sClusterName":"cluster" };

  function csvCell(v){ // undo Dashboards' formula escaping: '=SUM… -> =SUM…
    return (v.length>1 && v.charAt(0)==="'" && "=+-@\t\r".indexOf(v.charAt(1))>=0)? v.slice(1) : v;
  }
  function csvHeader(line, sep){
    return line.split(sep).map(function(h){
      h=h.trim(); if(h.charAt(0)==='"' && h.charAt(h.length-1)==='"') h=h.slice(1,-1).replace(/""/g,'"');
      return csvCell(h.trim());
    });
  }
  // {sep, cols} when the first line is a CSV header with a message column, else null
  function csvSniff(text){
    if(text.charCodeAt(0)===0xFEFF) text=text.slice(1);
    var nl=text.indexOf("\n"), line=(nl<0? text : text.slice(0,nl)).replace(/\r$/,"");
    if(!line || line.charAt(0)==="{") return null;
    var best=null;
    [",",";","\t"].forEach(function(sep){
      var cols=csvHeader(line, sep);
      if(cols.length<2 && cols[0]!=="message") return;
      if((cols.indexOf("message")>=0 || cols.indexOf("_source")>=0) && (!best || cols.length>best.cols.length)) best={sep:sep, cols:cols};
    });
    return best;
  }
  // RFC 4180 rows; quotes may wrap any field, "" inside quotes is a quote
  function csvRows(text, sep){
    if(text.charCodeAt(0)===0xFEFF) text=text.slice(1);
    var rows=[], row=[], i=0, n=text.length, sc=sep.charCodeAt(0);
    while(i<n){
      var c=text.charCodeAt(i), field;
      if(c===34){ // quoted
        var buf="", j=i+1;
        for(;;){
          var q=text.indexOf('"', j);
          if(q<0){ buf+=text.slice(j); i=n; break; }
          buf+=text.slice(j, q);
          if(text.charCodeAt(q+1)===34){ buf+='"'; j=q+2; continue; }
          i=q+1; break;
        }
        field=buf;
        while(i<n && text.charCodeAt(i)!==sc && text.charCodeAt(i)!==10 && text.charCodeAt(i)!==13) i++; // junk after the closing quote
      } else {
        var k=i;
        while(k<n){ var ck=text.charCodeAt(k); if(ck===sc||ck===10||ck===13) break; k++; }
        field=text.slice(i,k); i=k;
      }
      row.push(field);
      if(i>=n){ rows.push(row); break; }
      var d=text.charCodeAt(i);
      if(d===sc){ i++; if(i>=n){ row.push(""); rows.push(row); } }
      else { if(d===13 && text.charCodeAt(i+1)===10) i++; i++; rows.push(row); row=[]; }
    }
    return rows;
  }
  function csvDate(v){ // ISO, epoch ms, or Dashboards' "Oct 6, 2026 @ 12:12:55.304"
    if(!v) return NaN;
    if(/^\d{12,}$/.test(v)) return Number(v);
    var t=Date.parse(v); if(!isNaN(t)) return t;
    return Date.parse(v.replace(" @ "," "));
  }
  // -> {hits, rows} or {error}
  function csvToHits(text, name){
    var sn=csvSniff(text);
    if(!sn) return {error:(name||"файл")+": в CSV нет колонки message"};
    var rows=csvRows(text, sn.sep), cols=sn.cols; // rows[0] is that header
    var iMsg=cols.indexOf("message"), iSrc=cols.indexOf("_source"), iTs=cols.indexOf("@timestamp"),
        iId=cols.indexOf("_id"), iIdx=cols.indexOf("_index"), k8sIdx={};
    for(var c in CSV_K8S){ var ix=cols.indexOf(c); if(ix>=0) k8sIdx[CSV_K8S[c]]=ix; }
    var hits=[];
    for(var r=1;r<rows.length;r++){
      var row=rows[r];
      if(row.length===1 && row[0].trim()==="") continue; // blank line
      var msg=iMsg>=0? csvCell(row[iMsg]||"") : "";
      if(!msg && iSrc>=0){ try{ var so=JSON.parse(row[iSrc]||"null"); if(so && typeof so.message==="string") msg=so.message; }catch(e){} }
      if(!msg) continue;
      var k8s={};
      for(var f in k8sIdx){ var v=csvCell(row[k8sIdx[f]]||""); if(v!=="") k8s[f]=v; }
      hits.push({
        key: (iIdx>=0&&iId>=0)? row[iIdx]+"/"+row[iId] : "csv/"+r,
        ts: iTs>=0? csvDate(csvCell(row[iTs]||"").trim()) : NaN,
        msg: msg, k8s: k8s
      });
    }
    return {hits:hits, rows:rows.length-1};
  }
