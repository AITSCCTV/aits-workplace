// Read-only Page identity check. No uploads or publications are performed.
export async function checkStudioFacebook(settings, fetcher = fetch) {
  if (!settings.FACEBOOK_PAGE_ID || !settings.FACEBOOK_PAGE_TOKEN || !/^v\d+\.\d+$/.test(settings.META_GRAPH_VERSION || '')) return {ok:false,reason:'NOT_CONFIGURED'};
  try {
    const response = await fetcher('https://graph.facebook.com/' + settings.META_GRAPH_VERSION + '/me?fields=id', {
      headers:{Authorization:'Bearer ' + settings.FACEBOOK_PAGE_TOKEN}, signal:AbortSignal.timeout(10000),
    });
    const result = await response.json();
    if (!response.ok || result.error) return {ok:false,reason:result.error?.code === 190 ? 'TOKEN_EXPIRED_OR_INVALID' : 'CONNECTION_REJECTED'};
    return String(result.id) === settings.FACEBOOK_PAGE_ID ? {ok:true,reason:'CONNECTED'} : {ok:false,reason:'WRONG_PAGE'};
  } catch { return {ok:false,reason:'CHECK_UNAVAILABLE'}; }
}
