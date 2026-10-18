(() => {
  "use strict";

  const API = "/api/kabeuchi";
  const SUMMARY_MARK = "【まとめ】";
  const MAX_CHARS = 1000;
  const $ = (id) => document.getElementById(id);

  const views = ["kb-loading", "kb-form-view", "kb-sent-view", "kb-error-view", "kb-chat-view"];
  function show(id) {
    for (const v of views) $(v).hidden = v !== id;
    window.scrollTo(0, 0);
  }

  const app = {
    limitMs: 600000,
    bookingUrl: "",
    turnstileSiteKey: "",
    remainingMs: 0,
    clockAnchor: 0,
    clockRunning: false,
    busy: false,
    done: false,
    timer: null,
  };

  async function api(path, options = {}) {
    const init = { credentials: "same-origin", ...options };
    if (init.body !== undefined) {
      init.method = init.method || "POST";
      init.headers = { "Content-Type": "application/json", ...(init.headers || {}) };
      init.body = JSON.stringify(init.body);
    }
    return fetch(API + path, init);
  }

  async function readError(resp, fallback) {
    try {
      const data = await resp.json();
      if (data && typeof data.error === "string") return data.error;
    } catch (_) {}
    return fallback;
  }

  // ---------- rich text (no HTML parsing: escaped by construction via textContent) ----------
  function appendInline(parent, text) {
    const parts = text.split(/\*\*(.+?)\*\*/g);
    parts.forEach((part, i) => {
      if (!part) return;
      if (i % 2 === 1) {
        const strong = document.createElement("strong");
        strong.textContent = part;
        parent.appendChild(strong);
      } else {
        parent.appendChild(document.createTextNode(part));
      }
    });
  }

  function renderRich(container, text) {
    container.textContent = "";
    const lines = text.replace(/\r\n?/g, "\n").split("\n");
    let para = null;
    let list = null;
    let quote = null;
    const close = () => { para = null; list = null; quote = null; };
    for (const line of lines) {
      if (/^\s*-\s+/.test(line)) {
        para = null; quote = null;
        if (!list) { list = document.createElement("ul"); container.appendChild(list); }
        const li = document.createElement("li");
        appendInline(li, line.replace(/^\s*-\s+/, ""));
        list.appendChild(li);
      } else if (/^\s*>\s?/.test(line)) {
        para = null; list = null;
        if (!quote) { quote = document.createElement("blockquote"); container.appendChild(quote); }
        else quote.appendChild(document.createElement("br"));
        appendInline(quote, line.replace(/^\s*>\s?/, ""));
      } else if (!line.trim()) {
        close();
      } else {
        list = null; quote = null;
        if (!para) { para = document.createElement("p"); container.appendChild(para); }
        else para.appendChild(document.createElement("br"));
        appendInline(para, line);
      }
    }
  }

  function isSummary(text) {
    return text.trimStart().startsWith(SUMMARY_MARK);
  }

  function renderAssistant(el, text) {
    el.className = "msg assistant";
    if (isSummary(text)) {
      el.classList.add("summary");
      el.textContent = "";
      const h = document.createElement("h3");
      h.textContent = "まとめ";
      const body = document.createElement("div");
      renderRich(body, text.trimStart().slice(SUMMARY_MARK.length).replace(/^\s*\n/, ""));
      el.append(h, body);
    } else {
      renderRich(el, text);
    }
  }

  function addMessage(role, text) {
    const el = document.createElement("div");
    if (role === "user") {
      el.className = "msg user";
      el.textContent = text;
    } else {
      renderAssistant(el, text);
    }
    $("kb-messages").appendChild(el);
    return el;
  }

  function scrollToBottom() {
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  }

  // ---------- timer (display only; the server keeps the real clock) ----------
  function currentLeft() {
    if (!app.clockRunning) return app.remainingMs;
    return Math.max(0, app.remainingMs - (performance.now() - app.clockAnchor));
  }

  function startClock(remainingMs) {
    app.remainingMs = Math.max(0, remainingMs);
    app.clockAnchor = performance.now();
    app.clockRunning = true;
    renderClock();
  }

  function stopClock() {
    app.remainingMs = currentLeft();
    app.clockRunning = false;
    renderClock();
  }

  function renderClock() {
    const left = currentLeft();
    const sec = Math.ceil(left / 1000);
    $("kb-time").textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
    const ratio = app.limitMs ? Math.max(0, Math.min(1, left / app.limitMs)) : 0;
    const fill = $("kb-bar-fill");
    fill.style.width = `${(ratio * 100).toFixed(1)}%`;
    fill.classList.toggle("low", left <= 120000);
    const status = $("kb-status");
    if (app.done) {
      status.textContent = "終了しました";
      status.className = "kb-status";
    } else if (app.clockRunning) {
      status.textContent = "入力待ち・時計が進んでいます";
      status.className = "kb-status running";
    } else {
      status.textContent = "AIが返答中・時計は止まっています";
      status.className = "kb-status";
    }
  }

  function tick() {
    renderClock();
    if (app.clockRunning && !app.busy && !app.done && currentLeft() <= 0) {
      send({ timeup: true });
    }
  }

  // ---------- chat ----------
  function setComposerEnabled(enabled) {
    $("kb-input").disabled = !enabled;
    $("kb-send").disabled = !enabled;
  }

  function showChatError(text) {
    const el = $("kb-chat-error");
    el.textContent = text || "";
    el.hidden = !text;
  }

  function finish(emailMasked) {
    app.done = true;
    app.clockRunning = false;
    renderClock();
    $("kb-composer").hidden = true;
    $("kb-end-mail").textContent = emailMasked
      ? `まとめを ${emailMasked} 宛にもお送りします。`
      : "まとめをご登録のメールアドレス宛にもお送りします。";
    $("kb-end").hidden = false;
    scrollToBottom();
  }

  async function syncState() {
    try {
      const resp = await api("/state");
      if (!resp.ok) return null;
      const data = await resp.json();
      if (data.state === "user") startClock(data.remainingMs);
      return data;
    } catch (_) {
      return null;
    }
  }

  async function send({ timeup = false, initial = false } = {}) {
    if (app.busy || app.done) return;
    const input = $("kb-input");
    const message = initial ? "" : input.value.trim().slice(0, MAX_CHARS);
    if (!initial && !timeup && !message) return;

    app.busy = true;
    stopClock();
    setComposerEnabled(false);
    showChatError("");

    const userEl = message ? addMessage("user", message) : null;
    if (!initial) { input.value = ""; updateCount(); }
    const aiEl = document.createElement("div");
    aiEl.className = "msg assistant pending";
    aiEl.textContent = "考えています…";
    $("kb-messages").appendChild(aiEl);
    scrollToBottom();

    const body = initial ? {} : timeup ? { message, action: "timeup" } : { message };
    let text = "";
    let forced = false;
    let ok = false;
    let errorText = "AIの返答に失敗しました。もう一度送信してください。";
    let status = 0;
    try {
      const resp = await api("/chat", { body });
      status = resp.status;
      if (!resp.ok) {
        errorText = await readError(resp, errorText);
      } else {
        forced = resp.headers.get("X-Kb-Forced") === "1";
        const remaining = Number(resp.headers.get("X-Kb-Remaining-Ms"));
        if (Number.isFinite(remaining)) { app.remainingMs = remaining; renderClock(); }
        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          text += decoder.decode(value, { stream: true });
          renderAssistant(aiEl, text);
        }
        text += decoder.decode();
        ok = text.length > 0;
      }
    } catch (_) {
      ok = false;
    }

    app.busy = false;
    if (ok) {
      renderAssistant(aiEl, text);
      if (isSummary(text) || forced) {
        const data = await syncState();
        finish(data && data.emailMasked);
        return;
      }
      setComposerEnabled(true);
      startClock(app.remainingMs);
      input.focus({ preventScroll: true });
      return;
    }

    aiEl.remove();
    if (userEl) userEl.remove();
    if (status === 410) {
      const data = await syncState();
      if (data && data.state === "done") { await restore(data); return; }
    }
    if (status === 401) {
      showError("セッションが見つかりません。お手数ですが、もう一度お申し込みください。");
      return;
    }
    if (message && !input.value) { input.value = message; updateCount(); }
    showChatError(errorText);
    const data = await syncState();
    if (data && data.state === "done") { await restore(data); return; }
    if (data && data.state === "ready") {
      setComposerEnabled(false);
      const retry = document.createElement("button");
      retry.type = "button";
      retry.className = "btn-primary btn-small";
      retry.textContent = "もう一度はじめる";
      retry.addEventListener("click", () => { retry.remove(); send({ initial: true }); });
      $("kb-messages").appendChild(retry);
      return;
    }
    setComposerEnabled(true);
  }

  async function restore(data) {
    show("kb-chat-view");
    app.limitMs = data.limitMs || app.limitMs;
    if (data.bookingUrl) $("kb-booking").href = data.bookingUrl;
    $("kb-messages").textContent = "";
    for (const m of data.messages || []) addMessage(m.role, m.text);
    app.remainingMs = data.remainingMs;
    app.done = false;
    $("kb-composer").hidden = false;
    $("kb-end").hidden = true;

    if (data.state === "done") { finish(data.emailMasked); return; }
    if (data.state === "ready") { renderClock(); await send({ initial: true }); return; }
    if (data.state === "ai") {
      app.clockRunning = false;
      setComposerEnabled(false);
      renderClock();
      setTimeout(async () => {
        try {
          const resp = await api("/state");
          if (resp.ok) await restore(await resp.json());
        } catch (_) {}
      }, 2000);
      return;
    }
    setComposerEnabled(true);
    startClock(data.remainingMs);
    scrollToBottom();
  }

  function updateCount() {
    $("kb-count").textContent = `${$("kb-input").value.length} / ${MAX_CHARS}`;
  }

  function showError(text) {
    $("kb-error-text").textContent = text;
    show("kb-error-view");
  }

  // ---------- entry form ----------
  function loadTurnstile() {
    if (!app.turnstileSiteKey) {
      $("kb-turnstile").textContent = "（確認機能の設定が未完了です）";
      return;
    }
    window.kbTurnstileReady = () => {
      window.turnstile.render("#kb-turnstile", { sitekey: app.turnstileSiteKey, language: "ja", theme: "light" });
    };
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=kbTurnstileReady";
    s.async = true;
    document.head.appendChild(s);
  }

  function formError(text) {
    const el = $("kb-form-error");
    el.textContent = text || "";
    el.hidden = !text;
  }

  async function onSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const fd = new FormData(form);
    const val = (k) => String(fd.get(k) || "").trim();
    const payload = {
      company: val("company"),
      name: val("name"),
      title: val("title"),
      email: val("email"),
      stores: val("stores"),
      aiUsage: val("aiUsage"),
      consentPrivacy: fd.get("consentPrivacy") === "on",
      consentNewsletter: fd.get("consentNewsletter") === "on",
      turnstileToken: String(fd.get("cf-turnstile-response") || ""),
    };
    if (!payload.company || !payload.name || !payload.title || !payload.email || !payload.stores || !payload.aiUsage) {
      formError("未入力の項目があります。");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) { formError("メールアドレスの形式が正しくありません。"); return; }
    if (!payload.consentPrivacy) { formError("プライバシーポリシーへの同意が必要です。"); return; }
    if (!payload.turnstileToken) { formError("ロボットでないことの確認を完了してください。"); return; }

    formError("");
    const btn = $("kb-submit");
    btn.disabled = true;
    btn.textContent = "送信しています…";
    try {
      const resp = await api("/start", { body: payload });
      if (resp.ok) {
        $("kb-sent-email").textContent = payload.email;
        show("kb-sent-view");
        return;
      }
      formError(await readError(resp, "送信に失敗しました。時間をおいて再度お試しください。"));
    } catch (_) {
      formError("通信に失敗しました。電波の良い場所で、もう一度お試しください。");
    } finally {
      btn.disabled = false;
      btn.textContent = "開始リンクをメールで受け取る";
    }
    if (window.turnstile) window.turnstile.reset("#kb-turnstile");
  }

  // ---------- boot ----------
  async function loadConfig() {
    try {
      const resp = await api("/config");
      if (!resp.ok) return;
      const data = await resp.json();
      app.turnstileSiteKey = data.turnstileSiteKey || "";
      app.bookingUrl = data.bookingUrl || "";
      app.limitMs = data.limitMs || app.limitMs;
      if (app.bookingUrl) $("kb-booking").href = app.bookingUrl;
    } catch (_) {}
  }

  async function boot() {
    const params = new URLSearchParams(location.search);
    const token = params.get("t");
    if (token) history.replaceState(null, "", location.pathname);

    $("kb-form").addEventListener("submit", onSubmit);
    $("kb-composer").addEventListener("submit", (e) => { e.preventDefault(); send(); });
    $("kb-input").addEventListener("input", updateCount);
    $("kb-input").addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); }
    });
    app.timer = setInterval(tick, 250);

    await loadConfig();

    if (token) {
      try {
        const resp = await api("/verify", { body: { token } });
        if (resp.ok) {
          const data = await resp.json();
          app.limitMs = data.limitMs || app.limitMs;
          await restore({ state: "ready", remainingMs: app.limitMs, limitMs: app.limitMs, messages: [] });
          return;
        }
        const message = await readError(resp, "開始の処理に失敗しました。");
        const existing = await api("/state").catch(() => null);
        if (existing && existing.ok) { await restore(await existing.json()); return; }
        showError(message);
      } catch (_) {
        showError("通信に失敗しました。電波の良い場所で、もう一度リンクを開いてください。");
      }
      return;
    }

    try {
      const resp = await api("/state");
      if (resp.ok) { await restore(await resp.json()); return; }
    } catch (_) {}
    show("kb-form-view");
    loadTurnstile();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
