/* Google Health uses its OWN OAuth client/token, separate from Apps Script.
 * No library or web-app deployment needed. Credentials: Script Properties.
 * Tokens: User Properties, available to this author's time-based triggers.
 * Keep this personal project private; other editors can access credentials.
 */
var HEALTH_SCOPES = [
  'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly',
  'https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly',
  'https://www.googleapis.com/auth/googlehealth.sleep.readonly'
];

function authorizeAndInstall() {
  ScriptApp.requireAllScopes(ScriptApp.AuthMode.FULL);
  var client=healthClient_(), token=healthReadToken_();
  if (!token || token.client_id!==client.id) {
    authorizeHealth();
    return {status:'authorization_required'};
  }
  return install();
}

// Run to print the exact URI to register on the NEW Web OAuth client.
function showHealthRedirectUri() {console.log(healthRedirectUri_());}
function healthRedirectUri_() {
  return 'https://script.google.com/macros/d/' + ScriptApp.getScriptId() + '/usercallback';
}
function healthClient_() {
  var p=PropertiesService.getScriptProperties();
  var id=(p.getProperty('GH_CLIENT_ID')||'').trim();
  var secret=(p.getProperty('GH_CLIENT_SECRET')||'').trim();
  if(!/^[A-Za-z0-9_.-]+\.apps\.googleusercontent\.com$/.test(id)||!secret)
    throw healthSafeError_('Create a dedicated Web OAuth client, then set GH_CLIENT_ID and GH_CLIENT_SECRET in Project Settings > Script properties. Do not paste credentials into chat.');
  return {id:id,secret:secret};
}

// Permission disclosure: read activity, health measurements and sleep for
// private daily summaries. No Health writes or AI calls occur in this script.
function authorizeHealth() {
  ScriptApp.requireAllScopes(ScriptApp.AuthMode.FULL);
  var client=healthClient_(), lock=LockService.getUserLock();
  lock.waitLock(10000);
  try {
    var nonce=Utilities.getUuid()+Utilities.getUuid();
    PropertiesService.getUserProperties().setProperty('GH_PENDING',JSON.stringify({nonce:nonce,created:Date.now(),client_id:client.id}));
    var state=ScriptApp.newStateToken().withMethod('healthOAuthCallback')
      .withArgument('nonce',nonce).withTimeout(3600).createToken();
    var url='https://accounts.google.com/o/oauth2/v2/auth?'+query_({
      client_id:client.id,redirect_uri:healthRedirectUri_(),response_type:'code',
      scope:HEALTH_SCOPES.join(' '),access_type:'offline',prompt:'consent',
      include_granted_scopes:'false',state:state
    });
    console.log('Read-only access: activity, health measurements and sleep, for private daily summaries.');
    console.log('Open this private authorization URL within one hour. Do not share it:');
    console.log(url);
  } finally {lock.releaseLock();}
}

// Called by Google's signed /usercallback route; do not click Run for this.
function healthOAuthCallback(e) {
  var lock=LockService.getUserLock();
  lock.waitLock(10000);
  try {
    var p=PropertiesService.getUserProperties(), args=e&&e.parameter||{};
    var pending=JSON.parse(p.getProperty('GH_PENDING')||'null'), client=healthClient_();
    if(!pending||!args.nonce||args.nonce!==pending.nonce||pending.client_id!==client.id||
      Date.now()-pending.created>3600000)
      throw healthSafeError_('Authorization link expired or already used. Run authorizeHealth again.');
    p.deleteProperty('GH_PENDING');
    if(args.error)throw healthSafeError_('Google Health authorization was not completed. Run authorizeHealth to retry.');
    if(!args.code)throw healthSafeError_('No authorization code received. Run authorizeHealth again.');
    var token=healthTokenRequest_({client_id:client.id,client_secret:client.secret,
      code:args.code,redirect_uri:healthRedirectUri_(),grant_type:'authorization_code'},client.id,null);
    // Verify linking before saving; never display the returned identity.
    var r=UrlFetchApp.fetch(HEALTH+'identity',{headers:{Authorization:'Bearer '+token.access_token},muteHttpExceptions:true});
    if(r.getResponseCode()!==200)throw apiError_(r.getResponseCode(),r.getContentText(),HEALTH+'identity','get');
    var identity={};try{identity=JSON.parse(r.getContentText());}catch(ignore){}
    if(!identity.healthUserId)throw healthSafeError_('Google Account is not linked to Google Health.');
    var script=PropertiesService.getScriptProperties(), oldId=script.getProperty('healthUserId');
    if(oldId&&oldId!==identity.healthUserId)
      throw healthSafeError_('Different Health account detected. Existing history was retained; use the original account.');
    script.setProperty('healthUserId',identity.healthUserId);
    p.setProperty('GH_TOKEN',JSON.stringify(token));
    return HtmlService.createHtmlOutput('<p>Google Health 授权成功。请关闭此页，回到 Apps Script，再运行 authorizeAndInstall 完成首次同步及定时任务安装。</p>');
  } catch(err) {
    var text=err.httpCode||err.healthSafe?err.message:'Authorization could not be completed. Run diagnoseSetup in Apps Script.';
    return HtmlService.createHtmlOutput('<p>'+healthEscapeHtml_(text)+'</p><p>返回 Apps Script，运行 diagnoseSetup 查看安全诊断；重试授权请运行 authorizeHealth。</p>');
  } finally {lock.releaseLock();}
}

function healthReadToken_() {
  var text=PropertiesService.getUserProperties().getProperty('GH_TOKEN');
  if(!text)return null;
  try{return JSON.parse(text);}catch(ignore){throw healthSafeError_('Health token storage is invalid. Run authorizeHealth.');}
}
function healthAccessToken_() {
  var lock=LockService.getUserLock();
  lock.waitLock(10000);
  try {
    var client=healthClient_(), token=healthReadToken_();
    if(!token||token.client_id!==client.id)throw healthSafeError_('Google Health needs its own authorization. Run authorizeHealth, finish consent, then run authorizeAndInstall.');
    healthCheckScopes_(token.scope);
    if(token.access_token&&Number(token.expires_at)>Date.now()+60000)return token.access_token;
    if(!token.refresh_token)throw healthSafeError_('Google Health offline permission is missing. Run authorizeHealth.');
    var next=healthTokenRequest_({client_id:client.id,client_secret:client.secret,
      refresh_token:token.refresh_token,grant_type:'refresh_token'},client.id,token);
    PropertiesService.getUserProperties().setProperty('GH_TOKEN',JSON.stringify(next));
    return next.access_token;
  } finally {lock.releaseLock();}
}
function healthTokenRequest_(payload,clientId,previous) {
  var r=UrlFetchApp.fetch('https://oauth2.googleapis.com/token',{
    method:'post',payload:payload,muteHttpExceptions:true});
  var code=r.getResponseCode(), body={};
  try{body=JSON.parse(r.getContentText());}catch(ignore){}
  if(code!==200) {
    var reason=typeof body.error==='string'&&/^[a-z_]{1,60}$/.test(body.error)?body.error:'token_exchange_failed';
    throw healthSafeError_('Google Health OAuth HTTP '+code+' ('+reason+'). '+
      (reason==='invalid_grant'?'Run authorizeHealth to renew consent; Testing grants can expire after 7 days.':'Check the dedicated Web client ID, secret and redirect URI.'));
  }
  var scope=body.scope||(previous&&previous.scope);
  healthCheckScopes_(scope);
  var expires=Number(body.expires_in), refresh=body.refresh_token||(previous&&previous.refresh_token);
  if(typeof body.access_token!=='string'||!body.access_token||!isFinite(expires)||expires<=0||!refresh)
    throw healthSafeError_('No usable offline Health token received. Run authorizeHealth again using the dedicated client.');
  var token={client_id:clientId,access_token:body.access_token,refresh_token:refresh,
    expires_at:Date.now()+expires*1000,scope:scope,
    authorized_at:previous?previous.authorized_at:new Date().toISOString()};
  // An access-token refresh does not reset the original consent expiry.
  if(previous&&previous.refresh_expires_at)token.refresh_expires_at=previous.refresh_expires_at;
  if(body.refresh_token_expires_in&&(!previous||body.refresh_token))
    token.refresh_expires_at=Date.now()+Number(body.refresh_token_expires_in)*1000;
  return token;
}
function healthCheckScopes_(scope) {
  var scopes=typeof scope==='string'?scope.split(/\s+/).filter(Boolean):[];
  if(!scopes.length||scopes.some(function(s){return HEALTH_SCOPES.indexOf(s)<0;}))
    throw healthSafeError_('Health token has unexpected or unknown scopes. Use a new dedicated Web OAuth client and run authorizeHealth; do not add Drive or script scopes to this authorization.');
}
function healthSafeError_(text){var e=new Error(text);e.healthSafe=true;return e;}
function healthEscapeHtml_(text){return String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

// Read-only probes. No tokens, secrets, health values, codes or identity logs.
function diagnoseSetup() {
  var granted=ScriptApp.getAuthorizationInfo(ScriptApp.AuthMode.FULL).getAuthorizedScopes()||[];
  var p=PropertiesService.getScriptProperties();
  console.log(JSON.stringify({version:APP_VERSION,check:'script_setup',
    missing_script_scopes:CORE_SCOPES.filter(function(s){return granted.indexOf(s)<0;}),
    health_client_configured:!!(p.getProperty('GH_CLIENT_ID')&&p.getProperty('GH_CLIENT_SECRET')),
    health_token_saved:!!PropertiesService.getUserProperties().getProperty('GH_TOKEN')}));
  [['health.identity',HEALTH+'identity'],
    ['drive.files.list','https://www.googleapis.com/drive/v3/files?pageSize=1&fields=kind']].forEach(function(probe){
    try{request_(probe[1]);console.log(JSON.stringify({check:probe[0],http:200}));}
    catch(e){var result={check:probe[0]};
      if(e.diagnostics)result.diagnostics=e.diagnostics;
      else if(e.healthSafe)result.message=e.message;
      else result.setup_or_transport_error=true;
      console.log(JSON.stringify(result));}
  });
}
