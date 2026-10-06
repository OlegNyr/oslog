  // ---------- export ----------
  $("exportBtn").onclick=function(){
    if(!VIEW.length){ toast("nothing to export"); return; }
    var text=VIEW.map(function(i){return ALL[i].raw;}).join("\n")+"\n";
    var blob=new Blob([text],{type:"application/x-ndjson"});
    var a=document.createElement("a"); a.href=URL.createObjectURL(blob);
    a.download="filtered-"+VIEW.length+"-lines.log"; a.click();
    setTimeout(function(){URL.revokeObjectURL(a.href);},2000);
    toast("exported "+VIEW.length+" lines");
  };
