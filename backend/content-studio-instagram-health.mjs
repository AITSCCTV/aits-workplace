// Read-only checks. Never return credentials or raw provider messages.
export async function checkStudioInstagram(settings, fetcher = fetch) {
  if (!settings.INSTAGRAM_ACCOUNT_ID || !settings.INSTAGRAM_TOKEN || !/^v\d+\.\d+$/.test(settings.META_GRAPH_VERSION || '')) return {ok:false,reason:'NOT_CONFIGURED'};
  const host = settings.INSTAGRAM_API_HOST === 'graph.instagram.com' ? 'graph.instagram.com' : 'graph.facebook.com';
  const headers = {Authorization:'Bearer '+settings.INSTAGRAM_TOKEN};
  try {
    const response = await fetcher(`https://${host}/${settings.META_GRAPH_VERSION}/${settings.INSTAGRAM_ACCOUNT_ID}?fields=id,username`, {headers,signal:AbortSignal.timeout(10000)});
    const result = await response.json();
    if (!response.ok || result.error) return {ok:false,reason:result.error?.code === 190 ? 'TOKEN_EXPIRED_OR_INVALID' : 'CONNECTION_REJECTED'};
    if (String(result.id) !== settings.INSTAGRAM_ACCOUNT_ID) return {ok:false,reason:'WRONG_ACCOUNT'};
    const health = {ok:true,reason:'CONNECTED',username:result.username,expiryStatus:'UNAVAILABLE'};
    if (host === 'graph.facebook.com') {
      try {
        const debug = await fetcher(`https://${host}/${settings.META_GRAPH_VERSION}/debug_token?input_token=${encodeURIComponent(settings.INSTAGRAM_TOKEN)}`, {headers,signal:AbortSignal.timeout(10000)});
        const data = (await debug.json()).data;
        if (debug.ok && data && typeof data.expires_at === 'number') {
          health.expiryStatus = data.expires_at === 0 ? 'NO_SCHEDULED_EXPIRY' : 'EXPIRES';
          health.expiresAt = data.expires_at;
          health.dataAccessExpiresAt = data.data_access_expires_at;
          health.publishingPermission = Array.isArray(data.scopes) ? data.scopes.includes('instagram_content_publish') : null;
          if (data.is_valid === false) return {...health,ok:false,reason:'TOKEN_EXPIRED_OR_INVALID'};
          if (health.publishingPermission === false) return {...health,ok:false,reason:'PUBLISHING_PERMISSION_MISSING'};
        }
      } catch { /* Identity result remains useful if token inspection is unavailable. */ }
    }
    return health;
  } catch { return {ok:false,reason:'CHECK_UNAVAILABLE'}; }
}
