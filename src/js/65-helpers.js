  // ---------- helpers ----------
  function esc(s){ return String(s==null?"":s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];}); }
  function shortLogger(s){
    if(!s) return "";
    if(s.length<=34) return s;
    var p=s.split("."); if(p.length<=2) return s;
    // abbreviate leading packages: ru.otpbank.kc.acd.x.Y -> r.o.k.a.x.Y, keep last 2 full
    var head=p.slice(0,-2).map(function(x){return x.charAt(0);}).join(".");
    return head+"."+p.slice(-2).join(".");
  }
  function shortType(t){ if(!t) return ""; var p=t.split("."); return p[p.length-1]; }
  function fmtTime(r){
    if(isNaN(r.tsMs)) return "";
    var d=new Date(r.tsMs);
    return pad(d.getHours())+":"+pad(d.getMinutes())+":"+pad(d.getSeconds())+"."+pad3(d.getMilliseconds());
  }
  function fmtFull(r){
    if(isNaN(r.tsMs)) return r.ts||"(no timestamp)";
    var d=new Date(r.tsMs);
    return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate())+" "+
           pad(d.getHours())+":"+pad(d.getMinutes())+":"+pad(d.getSeconds())+"."+pad3(d.getMilliseconds());
  }
  function pad(n){return n<10?"0"+n:""+n;}
  function pad3(n){return n<10?"00"+n:n<100?"0"+n:""+n;}
  function fmtMs(ms){
    var d=new Date(ms);
    return pad(d.getHours())+":"+pad(d.getMinutes())+":"+pad(d.getSeconds());
  }
  function tryJson(s){
    if(typeof s!=="string") return null; var t=s.trim();
    if(!(t.charAt(0)==="{"||t.charAt(0)==="[")) return null;
    try{ return JSON.stringify(JSON.parse(t),null,2); }catch(e){ return null; }
  }
  function hl(text, qc){
    var safe=esc(text);
    if(!qc) return safe;
    try{
      if(qc.sub){
        var re=new RegExp(qc.sub.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),"gi");
        return safe.replace(re,function(m){return "<mark>"+m+"</mark>";});
      }
      if(qc.re){ return safe.replace(new RegExp(qc.re.source,"gi"),function(m){return m?"<mark>"+m+"</mark>":m;}); }
    }catch(e){}
    return safe;
  }
  function formatStack(s){
    // normalize CRLF/CR -> LF; a stray \r in white-space:pre renders as an extra blank line
    return esc(s).split(/\r\n|\r|\n/).map(function(l){
      return /^\s*at\s/.test(l)? '<span class="at">'+l+'</span>' : l;
    }).join("\n");
  }
  function jsonHighlight(s){
    return esc(s)
      .replace(/(&quot;(?:[^&]|&(?!quot;))*?&quot;)(\s*:)/g,'<span class="jk">$1</span>$2')
      .replace(/:\s*(&quot;(?:[^&]|&(?!quot;))*?&quot;)/g,': <span class="js">$1</span>')
      .replace(/:\s*(-?\d+\.?\d*)/g,': <span class="jn">$1</span>')
      .replace(/:\s*(true|false|null)/g,': <span class="jb">$1</span>');
  }
  function copy(text){
    try{
      navigator.clipboard.writeText(text).then(function(){toast("copied");},function(){fallbackCopy(text);});
    }catch(e){ fallbackCopy(text); }
  }
  function fallbackCopy(text){
    var ta=document.createElement("textarea"); ta.value=text; document.body.appendChild(ta);
    ta.select(); try{document.execCommand("copy");toast("copied");}catch(e){} document.body.removeChild(ta);
  }
  var toastT;
  function toast(msg){ var t=$("toast"); t.textContent=msg; t.classList.add("show"); clearTimeout(toastT); toastT=setTimeout(function(){t.classList.remove("show");},1200); }
