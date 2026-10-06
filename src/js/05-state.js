  // ---------- state ----------
  var ALL = [];            // parsed records
  var VIEW = [];           // filtered indices into ALL
  var corrIndex = new Map(); // correlation -> [indices into ALL] (logbook request/response pairs)
  var tlRange = null;        // {t0,t1} ms range currently drawn on the timeline (for drag->interval)
  var LANE_H = 12;           // px per timeline lane (9px bar + gap)
  var tlField = "traceId";   // current timeline grouping field: traceId | spanId | __idx (adaptive)
  var customCols = [];       // user-added columns: [{key, var}] from root-level JSON fields
  var ccSeq = 0;             // counter for stable per-custom-column CSS var names (--cc-N)
  var COL_EXCLUDE = { "sequenceNumber":1, "@timestamp":1, "level":1, "logger":1, "message":1 }; // already shown by built-ins
  var ROW_H = 24;
  var BUF = 8;             // virtual list overscan
  var selected = -1;       // index into ALL
  var LEVEL_ORDER = ["ERROR","WARN","INFO","DEBUG","TRACE","RAW"];
  var levelOn = {ERROR:true,WARN:true,INFO:true,DEBUG:true,TRACE:true,RAW:true};
  var filters = { q:"", regex:false, logger:null, loggerNeg:false, thread:null, trace:null, correlation:null, tsFrom:null, tsTo:null, fields:[] };

  var $ = function(id){return document.getElementById(id)};
  var vlist=$("vlist"), vspacer=$("vspacer"), vrows=$("vrows"),
      drop=$("drop"), detail=$("detail"), status=$("status");
