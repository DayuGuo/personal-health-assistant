/* Personal Health Assistant. Own Google account only; Google APIs only.
 * Google Health v4 read-only + Drive access restricted to app-created files.
 * First run: authorizeAndInstall() from Setup.gs.
 */
var APP_VERSION = '2026-11-06.3';
var CONFIG = { timezone: 'Europe/London', hour: 20, initialDays: 42, revisitDays: 7 };
var FAMILY = 'users/me/dataSourceFamilies/';
var HEALTH = 'https://health.googleapis.com/v4/users/me/';
var CORE_SCOPES = ['https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/script.external_request',
  'https://www.googleapis.com/auth/script.scriptapp'];
var DAILY = [
  ['daily-resting-heart-rate', 'dailyRestingHeartRate', 'beatsPerMinute', 'resting_hr_bpm', 'bpm'],
  ['daily-heart-rate-variability', 'dailyHeartRateVariability', 'averageHeartRateVariabilityMilliseconds', 'hrv_rmssd_ms', 'ms'],
  ['daily-oxygen-saturation', 'dailyOxygenSaturation', 'averagePercentage', 'spo2_pct', '%'],
  ['daily-respiratory-rate', 'dailyRespiratoryRate', 'breathsPerMinute', 'respiratory_rate_bpm', 'breaths/min'],
  ['daily-sleep-temperature-derivations', 'dailySleepTemperatureDerivations', 'nightlyTemperatureCelsius', 'skin_temperature_c', '°C']
];
var LABELS = { steps: '步数', distance_m: '距离', active_zone_minutes: '活跃区间加权分钟',
  resting_hr_bpm: '静息心率', hrv_rmssd_ms: '夜间 HRV（RMSSD）', spo2_pct: '夜间血氧',
  respiratory_rate_bpm: '呼吸频率', skin_temperature_c: '夜间皮肤温度', sleep_minutes: '主睡眠分钟' };

function install() {
  ScriptApp.requireScopes(ScriptApp.AuthMode.FULL, CORE_SCOPES);
  // A failed initial sync never creates a misleading working schedule.
  var result = syncDaily();
  var existing = ScriptApp.getProjectTriggers().filter(function(t) { return t.getHandlerFunction() === 'syncDaily'; });
  if (!existing.length) ScriptApp.newTrigger('syncDaily').timeBased().everyDays(1)
    .atHour(CONFIG.hour).nearMinute(0).inTimezone(CONFIG.timezone).create();
  console.log(JSON.stringify({version:APP_VERSION,status: result.status, timezone: CONFIG.timezone,
    daily_time: '20:00 approximately, +/- 15 minutes', folder_url: result.folder_url,
    trigger_count: ScriptApp.getProjectTriggers().filter(function(t) { return t.getHandlerFunction() === 'syncDaily'; }).length}));
}

function syncDaily() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) throw new Error('Another sync is running.');
  var props = PropertiesService.getScriptProperties();
  var started = new Date();
  var today = Utilities.formatDate(started, CONFIG.timezone, 'yyyy-MM-dd');
  var runId = Utilities.formatDate(started, 'UTC', 'yyyyMMdd_HHmmss') + '_' + Utilities.getUuid().slice(0, 8);
  var folder;
  try {
    var identity = request_(HEALTH + 'identity');
    if (!identity.healthUserId) throw new Error('Google Account is not linked to Google Health.');
    folder = ensureFolder_();
    var oldManifest = readStable_('manifestId');
    var oldSnapshot = oldManifest ? request_('https://www.googleapis.com/drive/v3/files/' + oldManifest.snapshot.id + '?alt=media') : null;
    var since = oldSnapshot ? addDays_(today, -CONFIG.revisitDays) : addDays_(today, -CONFIG.initialDays);
    if (oldSnapshot && oldSnapshot.fetched_through_date < since) since = addDays_(oldSnapshot.fetched_through_date, -2);
    var until = addDays_(today, 1);
    var metrics = {}, raw = {}, denied = [], successful = [];
    function fetchMetric(type, fn) {
      if (Date.now() - started.getTime() > 240000) throw new Error('Sync runtime budget exceeded; old manifest retained.');
      try { fn(); successful.push(type); }
      catch (e) { if (e.httpCode === 403 && e.scopeDenied) denied.push(type); else throw e; }
    }
    function put(day, key, value, source, unit) {
      if (day < since || day >= until) return;
      value = numeric_(value);
      if (value === null || value < 0 || (key === 'spo2_pct' && value > 100)) return;
      if (!metrics[day]) metrics[day] = {};
      metrics[day][key] = {value: value, source: source, unit: unit};
    }
    [['steps','steps','steps','steps'], ['distance','distance','distance_m','m'],
     ['active-zone-minutes','activeZoneMinutes','active_zone_minutes','weighted min']].forEach(function(def) {
      fetchMetric(def[0], function() {
        var points = rollup_(def[0], since, until); raw[def[0]] = points;
        points.forEach(function(p) {
          if (!Object.prototype.hasOwnProperty.call(p,def[1])) return; // absent means missing, not zero
          var value = p[def[1]], n;
          if (def[0] === 'steps') n = numeric_(value.countSum === undefined ? 0 : value.countSum);
          else if (def[0] === 'distance') {var mm=numeric_(value.millimetersSum === undefined ? 0 : value.millimetersSum);n=mm===null?null:mm/1000;}
          else n = ['sumInFatBurnHeartZone','sumInCardioHeartZone','sumInPeakHeartZone']
            .reduce(function(a,k) { return a + Number(value[k] || 0); }, 0);
          put(dateString_(p.civilStartTime.date), def[2], n, 'google-health-v4:google-wearables', def[3]);
        });
      });
    });
    DAILY.forEach(function(def) {
      fetchMetric(def[0], function() {
        var field = def[0].replace(/-/g,'_');
        var filter = field + '.date >= "' + since + '" AND ' + field + '.date < "' + until + '"';
        var points = reconciled_(def[0], filter, 'google-sources'); raw[def[0]] = points;
        var values = {};
        points.forEach(function(p) { var v = p[def[1]]; if (!v || !v.date) return;
          var day = dateString_(v.date), n = numeric_(v[def[2]]);
          if (n !== null && n > 0) { if (!values[day]) values[day] = []; values[day].push(n); }
        });
        Object.keys(values).forEach(function(day) { put(day, def[3], median_(values[day]), 'google-health-v4:google-sources', def[4]); });
      });
    });
    fetchMetric('sleep', function() {
      var filter = 'sleep.interval.civil_end_time >= "' + since + '" AND sleep.interval.civil_end_time < "' + until + '"';
      var points = reconciled_('sleep', filter, 'google-wearables'); raw.sleep = points;
      var sleep = sleepDays_(points);
      Object.keys(sleep).forEach(function(day) { put(day, 'sleep_minutes', sleep[day].minutes,
        'google-health-v4:google-wearables:' + sleep[day].selection, 'min'); });
    });
    if (!successful.length) throw new Error('No Google Health data scopes are available.');
    var merged = mergeDays_(oldSnapshot ? oldSnapshot.days : {}, metrics, since, until, successful);
    var any = Object.keys(merged).some(function(day) { return Object.keys(merged[day]).length > 0; });
    if (!any) throw new Error('No supported health records returned; no empty snapshot committed.');
    var snapshot = {schema_version: 2, code_version:APP_VERSION, run_id: runId, fetched_at_utc: started.toISOString(),
      fetched_through_date: today, query_start_date: since, timezone: CONFIG.timezone,
      status: denied.length ? 'partial' : 'success', denied_data_types: denied,
      successful_data_types: successful, days: merged,
      latest_record_date: Object.keys(merged).filter(function(d){return Object.keys(merged[d]).length;}).sort().pop(),
      summary: summarize_(merged, today), raw_refresh: raw,
      rules: [
        'Activity uses Google Health reconciled google-wearables daily civil-time rollups; distance converted from millimeters to meters.',
        'Daily physiological metrics use google-sources, the API civil date and median if multiple records remain.',
        'Sleep uses reconciled google-wearables sessions and API mainSleep flag; otherwise longest valid session, marked as fallback.',
        'Missing values are null/absent; explicit API zero activity is preserved. Today is partial and excluded from comparisons.',
        'Permissions denied for individual types preserve older values and expose their previous fetched_at_utc.',
        'Takeout historical CSV, readiness, cardio load, sleep score and heart-rate coverage are separate and not silently appended.',
        'Different methods and source labels must not be compared as one uninterrupted series.',
        'Skin temperature is not core body temperature; these are descriptive statistics, not diagnoses.'
      ]};
    // Immutable data generation, then ONE manifest pointer commit. A failed
    // upload leaves the previous complete generation readable.
    var snapshotFile = createFile_(folder, 'snapshot_' + runId + '.json', 'application/json', JSON.stringify(snapshot));
    var csvFile = createFile_(folder, 'daily_' + runId + '.csv', 'text/csv', csv_(merged, today, runId));
    var briefFile = createFile_(folder, 'brief_' + runId + '.md', 'text/markdown', brief_(snapshot));
    var manifest = {schema_version:2, run_id:runId, committed_at_utc:new Date().toISOString(),
      status:snapshot.status, snapshot:snapshotFile, daily_csv:csvFile, brief:briefFile,
      latest_record_date:snapshot.latest_record_date, denied_data_types:denied,
      timezone:CONFIG.timezone, daily_target:'20:00 +/-15 minutes'};
    writeStable_('manifestId', folder, 'live_manifest.json', manifest);
    var result = {version:APP_VERSION,status:snapshot.status, last_attempt_utc:new Date().toISOString(),
      last_success_utc:manifest.committed_at_utc, run_id:runId, latest_record_date:snapshot.latest_record_date,
      folder_url:'https://drive.google.com/drive/folders/' + folder, denied_data_types:denied};
    writeStable_('statusId', folder, 'sync_status.json', result);
    props.setProperty('lastSuccess', manifest.committed_at_utc);
    return result;
  } catch(e) {
    var status = {status:'failed',last_attempt_utc:new Date().toISOString(),
      last_success_utc:props.getProperty('lastSuccess') || null,
      message:e.httpCode ? e.message : String(e.message).slice(0,200)};
    if(e.diagnostics)status.diagnostics=e.diagnostics;
    if (folder) { try { writeStable_('statusId',folder,'sync_status.json',status); } catch(ignore) {} }
    // Apps Script's trigger failure email handles notification; no Gmail scope.
    throw new Error(status.message);
  } finally { lock.releaseLock(); }
}

function rollup_(type, start, end) {
  var result=[];
  for(var from=start;from<end;from=to){var to=addDays_(from,14);if(to>end)to=end;
    result=result.concat(pages_(function(token) { return request_(HEALTH+'dataTypes/'+type+'/dataPoints:dailyRollUp',
      'post',{range:{start:{date:dateObject_(from)},end:{date:dateObject_(to)}},windowSizeDays:1,
        dataSourceFamily:FAMILY+'google-wearables',pageSize:1000,pageToken:token || undefined}); },'rollupDataPoints'));
  }return result;
}
function reconciled_(type, filter, family) {
  var fields = type === 'sleep' ? 'dataPoints(dataPointName,sleep(interval,metadata,summary,updateTime)),nextPageToken' : null;
  return pages_(function(token){return request_(HEALTH+'dataTypes/'+type+'/dataPoints:reconcile?'+query_({
    filter:filter, dataSourceFamily:FAMILY+family, pageSize:type==='sleep'?25:1000,pageToken:token,fields:fields}));},'dataPoints');
}
function pages_(fn, field) {
  var result=[], token='', seen={};
  for(var i=0;i<100;i++) {var r=fn(token);result=result.concat(r[field]||[]);if(!r.nextPageToken)return result;
    if(seen[r.nextPageToken])throw new Error('Repeated pagination token');seen[r.nextPageToken]=true;token=r.nextPageToken;}
  throw new Error('Pagination limit exceeded; no partial response committed.');
}
function request_(url, method, payload) {
  if (!/^https:\/\/(health\.googleapis\.com|www\.googleapis\.com)\//.test(url)) throw new Error('Unexpected API host');
  for(var i=0;i<4;i++) {
    // Health must never receive the Apps Script token: it also carries Drive
    // and script scopes, which Health rejects as DISALLOWED_OAUTH_SCOPES.
    var token=/^https:\/\/health\.googleapis\.com\//.test(url)?healthAccessToken_():ScriptApp.getOAuthToken();
    var options={method:method||'get',headers:{Authorization:'Bearer '+token},muteHttpExceptions:true};
    if(payload!==undefined){options.contentType='application/json';options.payload=JSON.stringify(payload);}
    var r=UrlFetchApp.fetch(url,options), code=r.getResponseCode(), text=r.getContentText();
    if(code>=200&&code<300)return text?JSON.parse(text):{};
    if((code===429||code>=500)&&i<3){Utilities.sleep(Math.pow(2,i)*1000);continue;}
    throw apiError_(code,text,url,method||'get');
  }
}
function ensureFolder_() {
  var props=PropertiesService.getScriptProperties(),id=props.getProperty('folderId');if(id)return id;
  var folder=request_('https://www.googleapis.com/drive/v3/files','post',{name:'Health Assistant Live',mimeType:'application/vnd.google-apps.folder'});
  props.setProperty('folderId',folder.id);return folder.id;
}
function createFile_(folder,name,mime,content) {
  var file=request_('https://www.googleapis.com/drive/v3/files','post',{name:name,mimeType:mime,parents:[folder]});
  updateContent_(file.id,mime,content);return {id:file.id,url:'https://drive.google.com/file/d/'+file.id+'/view',name:name};
}
function updateContent_(id,mime,content) {
  var r=UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files/'+id+'?uploadType=media',{
    method:'patch',contentType:mime,payload:content,muteHttpExceptions:true,
    headers:{Authorization:'Bearer '+ScriptApp.getOAuthToken()}});
  var code=r.getResponseCode();if(code<200||code>=300)throw apiError_(code,r.getContentText(),'https://www.googleapis.com/upload/drive/v3/files/{fileId}','patch');
}
// Retain machine-readable failure reasons without logging tokens, response
// messages, request queries, file IDs, identity values or health measurements.
function apiError_(code,text,url,method){
  var payload={};try{payload=JSON.parse(text).error||{};}catch(ignore){}
  function safe(v){return typeof v==='string'&&/^[A-Za-z0-9_.-]{1,100}$/.test(v)?v:'unspecified';}
  var endpoint='google-api';
  if(url.indexOf(HEALTH+'identity')===0)endpoint='health.identity';
  else if(url.indexOf(HEALTH+'dataTypes/')===0){var match=url.match(/dataTypes\/([a-z-]+)\/dataPoints(?::([A-Za-z]+))?/);if(match)endpoint='health.'+match[1]+'.'+(match[2]||'list');}
  else if(url.indexOf('https://www.googleapis.com/upload/drive/')===0)endpoint='drive.files.upload';
  else if(url.indexOf('https://www.googleapis.com/drive/')===0)endpoint='drive.files.'+(method==='post'?'create':'read');
  var diag={endpoint:endpoint,http:code,google_status:safe(payload.status),reasons:[]};
  (payload.details||[]).forEach(function(d){if(d['@type']!=='type.googleapis.com/google.rpc.ErrorInfo')return;
    diag.reasons.push(safe(d.reason));var m=d.metadata||{};
    if(/^[a-z0-9.-]+\.googleapis\.com$/.test(m.service||''))diag.service=m.service;
    if(/^projects\/[0-9]+$/.test(m.consumer||''))diag.consumer=m.consumer;
  });
  (payload.errors||[]).forEach(function(d){diag.reasons.push(safe(d.reason));});
  diag.legacy_account_token_error=/Could not mint UberMint from GaiaMint/.test(payload.message||'');
  var e=new Error('Google API error '+JSON.stringify(diag));e.httpCode=code;e.diagnostics=diag;
  e.serviceDisabled=diag.reasons.some(function(r){return r==='SERVICE_DISABLED'||r==='accessNotConfigured';});
  e.scopeDenied=diag.reasons.some(function(r){return r==='MISSING_OAUTH_SCOPE'||r==='ACCESS_TOKEN_SCOPE_INSUFFICIENT'||r==='insufficientPermissions';});
  return e;
}
function readStable_(key) {var id=PropertiesService.getScriptProperties().getProperty(key);
  return id?request_('https://www.googleapis.com/drive/v3/files/'+id+'?alt=media'):null;}
function writeStable_(key,folder,name,object) {var props=PropertiesService.getScriptProperties(),id=props.getProperty(key),s=JSON.stringify(object);
  if(id)updateContent_(id,'application/json',s);else{var f=createFile_(folder,name,'application/json',s);props.setProperty(key,f.id);}}
function numeric_(x){if(x===null||x===undefined||x==='')return null;var n=Number(x);return isFinite(n)?n:null;}
function median_(values){var a=values.slice().sort(function(x,y){return x-y;}),n=a.length;return n?n%2?a[(n-1)/2]:(a[n/2-1]+a[n/2])/2:null;}
function addDays_(day,n){var d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
function dateObject_(s){var a=s.split('-').map(Number);return {year:a[0],month:a[1],day:a[2]};}
function dateString_(d){return d.year+'-'+('0'+d.month).slice(-2)+'-'+('0'+d.day).slice(-2);}
function query_(o){return Object.keys(o).filter(function(k){return o[k]!==undefined&&o[k]!==null&&o[k]!=='';}).map(function(k){return encodeURIComponent(k)+'='+encodeURIComponent(o[k]);}).join('&');}
function sleepDays_(points){
  var days={};points.forEach(function(p){var s=p.sleep;if(!s||!s.interval||!s.summary||s.metadata&&s.metadata.processed===false)return;
    var n=numeric_(s.summary.minutesAsleep);if(n===null||n<0)return;
    var civil=s.interval.civilEndTime,day;
    if(civil&&civil.date)day=dateString_(civil.date);
    else {var off=parseFloat(s.interval.endUtcOffset||'0');day=new Date(new Date(s.interval.endTime).getTime()+off*1000).toISOString().slice(0,10);}
    var isMain=!!(s.metadata&&s.metadata.mainSleep),old=days[day];
    if(!old||(isMain&&!old.isMain)||(isMain===old.isMain&&n>old.minutes))days[day]={minutes:n,isMain:isMain,selection:isMain?'mainSleep':'longest-fallback'};
  });return days;
}
function mergeDays_(old,newDays,start,end,successful){
  var merged=JSON.parse(JSON.stringify(old)),keys=[];
  successful.forEach(function(type){if(type==='steps')keys.push('steps');else if(type==='distance')keys.push('distance_m');
    else if(type==='active-zone-minutes')keys.push('active_zone_minutes');else if(type==='sleep')keys.push('sleep_minutes');
    else DAILY.forEach(function(d){if(d[0]===type)keys.push(d[3]);});});
  Object.keys(merged).forEach(function(day){if(day>=start&&day<end)keys.forEach(function(k){delete merged[day][k];});});
  var fetched=new Date().toISOString();Object.keys(newDays).forEach(function(day){if(!merged[day])merged[day]={};
    Object.keys(newDays[day]).forEach(function(k){merged[day][k]=Object.assign({fetched_at_utc:fetched},newDays[day][k]);});});
  return merged;
}
function summarize_(days,today){var end=addDays_(today,-1),start=addDays_(end,-6),baseline=addDays_(end,-34),result={};
  Object.keys(LABELS).forEach(function(k){var a=[],b=[],source=null;
    Object.keys(days).sort().forEach(function(day){if(day>=start&&day<=end&&days[day][k])source=days[day][k].source;});
    Object.keys(days).forEach(function(day){var p=days[day][k];if(!p||p.source!==source)return;
      if(day>=start&&day<=end)a.push(p.value);else if(day>=baseline&&day<start)b.push(p.value);});
    var ma=median_(a),mb=median_(b);result[k]={source:source,recent_days:a.length,baseline_days:b.length,recent_median:ma,
      baseline_median:mb,delta:a.length>=4&&b.length>=14?ma-mb:null};});
  return {recent_period:[start,end],baseline_period:[baseline,addDays_(start,-1)],metrics:result};}
function csv_(days,today,runId){var keys=Object.keys(LABELS),header=['date','day_status','run_id'];
  keys.forEach(function(k){header.push(k,k+'_source',k+'_fetched_at_utc');});
  var lines=[header];Object.keys(days).sort().forEach(function(day){var row=[day,day>=today?'partial_day':'past_day_coverage_unknown',runId];
    keys.forEach(function(k){var p=days[day][k];row.push(p?p.value:'',p?p.source:'',p?p.fetched_at_utc:'');});lines.push(row);});
  return '\ufeff'+lines.map(function(row){return row.map(function(v){return '"'+String(v).replace(/"/g,'""')+'"';}).join(',');}).join('\r\n');}
function brief_(s){var a=['# 云端健康数据简报','','数据抓取时间：'+s.fetched_at_utc,'最近有记录的日期：'+s.latest_record_date,
  '运行 ID：'+s.run_id,'同步状态：'+s.status,'最近窗口：'+s.summary.recent_period.join(' 至 '),'基线窗口：'+s.summary.baseline_period.join(' 至 '),
  '', '| 指标 | 近期中位数 | 基线中位数 | 有效天数（近期/基线） |','| --- | ---: | ---: | --- |'];
  Object.keys(LABELS).forEach(function(k){var m=s.summary.metrics[k];function f(v){return v===null?'—':Number(v).toFixed(1);}
    a.push('| '+LABELS[k]+' | '+f(m.recent_median)+' | '+f(m.baseline_median)+' | '+m.recent_days+'/7；'+m.baseline_days+'/28 |');});
  return a.concat(['','今天的活动仍在累积，未参与比较。缺失未补零。API 方法与旧 Takeout 不直接混合比较。',
    '拒绝授权的数据类型：'+(s.denied_data_types.join(', ')||'无'),'皮肤温度不是核心体温；本简报仅描述记录变化。']).join('\n');}
