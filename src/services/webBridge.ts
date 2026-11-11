// Lets native screens drive the WebView that stays mounted underneath them

interface WebViewHandle {
  injectJavaScript: (script: string) => void;
}

type WebViewGetter = () => WebViewHandle | null;

let getWebView: WebViewGetter | null = null;

export const webBridge = {
  attach(getter: WebViewGetter) {
    getWebView = getter;
  },

  detach(getter: WebViewGetter) {
    if (getWebView === getter) getWebView = null;
  },

  // Client-side navigation in the web app; react-router picks up the popstate
  navigate(path: string): boolean {
    const webView = getWebView?.();
    if (!webView) return false;
    webView.injectJavaScript(`
      (function() {
        window.history.pushState(null, '', ${JSON.stringify(path)});
        window.dispatchEvent(new PopStateEvent('popstate'));
      })();
      true;
    `);
    return true;
  },

  // Full page load, so the web app fetches its data again (a same-path navigate keeps the old list).
  // Without a path the current page reloads.
  reload(path?: string): boolean {
    const webView = getWebView?.();
    if (!webView) return false;
    webView.injectJavaScript(`
      (function() {
        var path = ${JSON.stringify(path ?? null)};
        if (path) window.location.assign(path);
        else window.location.reload();
      })();
      true;
    `);
    return true;
  },
};
