// Cloudflare Turnstile helper for FooDX forms (site key from GET /api/contact).
(function (global) {
  const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
  let scriptPromise = null;
  let siteKeyPromise = null;

  function loadScript() {
    if (global.turnstile && typeof global.turnstile.render === "function") {
      return Promise.resolve();
    }
    if (scriptPromise) return scriptPromise;
    scriptPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-foodx-turnstile]');
      if (existing) {
        existing.addEventListener("load", () => resolve());
        existing.addEventListener("error", () => reject(new Error("Turnstile script failed")));
        return;
      }
      const s = document.createElement("script");
      s.src = SCRIPT_SRC;
      s.async = true;
      s.defer = true;
      s.dataset.foodxTurnstile = "1";
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Turnstile script failed"));
      document.head.appendChild(s);
    });
    return scriptPromise;
  }

  function fetchSiteKey() {
    if (siteKeyPromise) return siteKeyPromise;
    siteKeyPromise = fetch("/api/contact", { method: "GET", headers: { Accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : {}))
      .then((data) => (data && data.turnstileSiteKey ? String(data.turnstileSiteKey) : ""))
      .catch(() => "");
    return siteKeyPromise;
  }

  /**
   * Mount Turnstile into `el`. Returns { widgetId, getToken, reset } or null if not configured.
   */
  async function mount(el, options) {
    if (!el) return null;
    const siteKey = await fetchSiteKey();
    if (!siteKey) return null;
    await loadScript();
    if (!global.turnstile || typeof global.turnstile.render !== "function") return null;

    el.innerHTML = "";
    const widgetId = global.turnstile.render(el, {
      sitekey: siteKey,
      theme: (options && options.theme) || "light",
      language: "ja",
      appearance: (options && options.appearance) || "always",
    });

    return {
      widgetId,
      getToken() {
        try {
          return global.turnstile.getResponse(widgetId) || "";
        } catch (_) {
          return "";
        }
      },
      reset() {
        try {
          global.turnstile.reset(widgetId);
        } catch (_) {}
      },
    };
  }

  global.FooDXTurnstile = { mount, fetchSiteKey, loadScript };
})(typeof window !== "undefined" ? window : globalThis);
