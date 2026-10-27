/**
 * 壁打ちバディ — GAS 受信一式（貼り付け用・この1ファイルだけでよい）
 *
 * スプレッドシート:
 * - コンテナバインドなら getActiveSpreadsheet()
 * - 見つからない場合はスクリプトプロパティ SPREADSHEET_ID を使う
 *
 * スクリプトプロパティ:
 * - GAS_SHARED_SECRET（必須）… 送信側と同じ合言葉
 * - SPREADSHEET_ID（任意）… スプレッドシートの ID（URL の /d/XXXX/ の XXXX）
 *
 * 受信: POST JSON（送信側は body.secret）
 * action: start | verified | complete | abandoned | export
 *
 * start 時: シート記録のあと、email + verifyUrl があれば開始リンクメールを送る
 */

var SHEET_NAME = "壁打ちログ";
var CELL_MAX = 50000;
var HEADERS = [
  "sid",
  "状態",
  "開始時刻",
  "最終更新",
  "往復数",
  "規模の帯",
  "回答者の立場",
  "面談予約の有無",
  "要約",
  "採点",
  "会話全文",
  "その他",
];

// 列番号（1始まり）
var COL = {
  SID: 1,
  STATUS: 2,
  STARTED: 3,
  UPDATED: 4,
  TURNS: 5,
  BAND: 6,
  TITLE: 7,
  BOOKED: 8,
  SUMMARY: 9,
  SCORING: 10,
  TRANSCRIPT: 11,
  EXTRA: 12,
};

function doPost(e) {
  try {
    var body = parseBody_(e);
    if (!checkSecret_(body)) {
      return jsonOut_({ ok: false, error: "unauthorized" });
    }
    var action = String(body.action || "");
    if (action === "start") return jsonOut_(handleStart_(body));
    if (action === "verified") return jsonOut_(handleVerified_(body));
    if (action === "complete") return jsonOut_(handleComplete_(body));
    if (action === "abandoned") return jsonOut_(handleAbandoned_(body));
    if (action === "export") return jsonOut_(handleExport_(body));
    return jsonOut_({ ok: false, error: "unknown_action" });
  } catch (err) {
    // 会話本文は出さない
    return jsonOut_({ ok: false, error: "server_error", code: String(err && err.message ? err.message : err).slice(0, 80) });
  }
}

function doGet() {
  return jsonOut_({ ok: false, error: "method_not_allowed" });
}

// ---------------------------------------------------------------------------
// actions
// ---------------------------------------------------------------------------

function handleStart_(body) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sheet = getOrCreateSheet_();
    var leadId = String(body.leadId || "");
    if (!leadId) return { ok: false, error: "missing_leadId" };

    var row = findRowByLeadId_(sheet, leadId);
    var now = new Date();
    var started = toDate_(body.startedAt) || now;
    var extra = buildExtra_(body, { leadId: leadId });

    if (row > 0) {
      patchRow_(sheet, row, {
        status: "開始",
        startedAt: started,
        updatedAt: now,
        title: body.title,
        extra: extra,
      });
    } else {
      appendRow_(sheet, {
        sid: "",
        status: "開始",
        startedAt: started,
        updatedAt: now,
        turnCount: 0,
        band: "",
        title: body.title || "",
        booked: false,
        summary: "",
        scoring: "",
        transcript: "",
        extra: extra,
      });
    }
    sendStartMail_(body);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

function handleVerified_(body) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sheet = getOrCreateSheet_();
    var leadId = String(body.leadId || "");
    var sid = String(body.sid || "");
    if (!leadId && !sid) return { ok: false, error: "missing_id" };

    var row = sid ? findRowBySid_(sheet, sid) : 0;
    if (row < 1 && leadId) row = findRowByLeadId_(sheet, leadId);
    var now = new Date();
    var extra = buildExtra_(body, { leadId: leadId });

    if (row > 0) {
      patchRow_(sheet, row, {
        sid: sid || undefined,
        status: "検証済み",
        updatedAt: now,
        extra: mergeExtra_(sheet, row, extra),
      });
    } else {
      appendRow_(sheet, {
        sid: sid,
        status: "検証済み",
        startedAt: now,
        updatedAt: now,
        turnCount: 0,
        band: "",
        title: "",
        booked: false,
        summary: "",
        scoring: "",
        transcript: "",
        extra: extra,
      });
    }
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

function handleComplete_(body) {
  return upsertSessionRow_(body, "完了");
}

function handleAbandoned_(body) {
  return upsertSessionRow_(body, "離脱");
}

function upsertSessionRow_(body, status) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sheet = getOrCreateSheet_();
    var sid = String(body.sid || "");
    var leadId = String(body.leadId || "");
    if (!sid && !leadId) return { ok: false, error: "missing_id" };

    // 完了済みを離脱で潰さない
    var row = sid ? findRowBySid_(sheet, sid) : 0;
    if (row < 1 && leadId) row = findRowByLeadId_(sheet, leadId);
    if (row > 0 && status === "離脱") {
      var cur = String(sheet.getRange(row, COL.STATUS).getValue() || "");
      if (cur === "完了") return { ok: true, skipped: "already_complete" };
    }

    var now = new Date();
    var started = toDate_(body.startedAt);
    var updated = toDate_(body.lastTouchedAt) || now;
    var extra = buildExtra_(body, { leadId: leadId });
    var fields = {
      sid: sid || undefined,
      status: status,
      startedAt: started,
      updatedAt: updated,
      turnCount: body.turnCount,
      band: body.band,
      title: body.title,
      booked: body.booked,
      summary: body.summary,
      scoring: body.scoring,
      transcript: body.transcript,
      extra: extra,
    };

    if (row > 0) {
      if (status === "完了" || status === "離脱") {
        fields.extra = mergeExtra_(sheet, row, extra);
      }
      patchRow_(sheet, row, fields);
    } else {
      appendRow_(sheet, {
        sid: sid,
        status: status,
        startedAt: started || now,
        updatedAt: updated,
        turnCount: Number(body.turnCount || 0),
        band: body.band || "",
        title: body.title || "",
        booked: Boolean(body.booked),
        summary: body.summary || "",
        scoring: body.scoring,
        transcript: body.transcript || "",
        extra: extra,
      });
    }
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

/**
 * learn.mjs 期待形:
 * { ok:true, rows:[{ sid, status, startedAt, turnCount, band, title, booked, transcript, summary, scoring }] }
 */
function handleExport_(body) {
  var sinceMs = parseSince_(body.since);
  if (sinceMs == null) return { ok: false, error: "bad_since" };

  var sheet = getOrCreateSheet_();
  var last = sheet.getLastRow();
  if (last < 2) return { ok: true, count: 0, rows: [] };

  var values = sheet.getRange(2, 1, last - 1, HEADERS.length).getValues();
  var rows = [];
  for (var i = 0; i < values.length; i++) {
    var r = values[i];
    var updatedMs = cellToMs_(r[COL.UPDATED - 1]);
    var startedMs = cellToMs_(r[COL.STARTED - 1]);
    var anchor = updatedMs != null ? updatedMs : startedMs;
    if (anchor == null || anchor < sinceMs) continue;

    rows.push({
      sid: String(r[COL.SID - 1] || ""),
      status: String(r[COL.STATUS - 1] || ""),
      startedAt: startedMs,
      turnCount: Number(r[COL.TURNS - 1] || 0),
      band: String(r[COL.BAND - 1] || ""),
      title: String(r[COL.TITLE - 1] || ""),
      booked: toBool_(r[COL.BOOKED - 1]),
      summary: String(r[COL.SUMMARY - 1] || ""),
      scoring: parseScoringCell_(r[COL.SCORING - 1]),
      transcript: String(r[COL.TRANSCRIPT - 1] || ""),
    });
  }
  return { ok: true, count: rows.length, rows: rows };
}

// ---------------------------------------------------------------------------
// sheet helpers
// ---------------------------------------------------------------------------

function getSpreadsheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss) return ss;
  var id = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID") || "";
  if (!id) {
    throw new Error("spreadsheet_not_found");
  }
  return SpreadsheetApp.openById(id);
}

function getOrCreateSheet_() {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
  } else if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** 開始リンクメール（本文に個人情報を Logger へは出さない） */
function sendStartMail_(body) {
  var to = String(body.email || "").trim();
  var url = String(body.verifyUrl || "").trim();
  if (!to || !url) return;
  var name = String(body.name || "").trim();
  var greeting = name ? name + " 様" : "ご担当者様";
  MailApp.sendEmail({
    to: to,
    subject: "【FooDX】壁打ちバディの開始リンク",
    body:
      greeting +
      "\n\n壁打ちバディのお申し込みありがとうございます。\n" +
      "次のリンクから、30分以内に壁打ちを開始してください。\n\n" +
      url +
      "\n\n※このメールに心当たりがない場合は破棄してください。\n" +
      "FooDX合同会社\n",
  });
}

function findRowBySid_(sheet, sid) {
  if (!sid) return 0;
  var last = sheet.getLastRow();
  if (last < 2) return 0;
  var col = sheet.getRange(2, COL.SID, last - 1, 1).getValues();
  for (var i = 0; i < col.length; i++) {
    if (String(col[i][0]) === sid) return i + 2;
  }
  return 0;
}

function findRowByLeadId_(sheet, leadId) {
  if (!leadId) return 0;
  var last = sheet.getLastRow();
  if (last < 2) return 0;
  var col = sheet.getRange(2, COL.EXTRA, last - 1, 1).getValues();
  var needle = '"leadId":"' + leadId + '"';
  for (var i = 0; i < col.length; i++) {
    var raw = String(col[i][0] || "");
    if (raw.indexOf(needle) !== -1) return i + 2;
  }
  return 0;
}

function appendRow_(sheet, f) {
  sheet.appendRow([
    f.sid || "",
    f.status || "",
    f.startedAt || "",
    f.updatedAt || "",
    f.turnCount == null ? "" : Number(f.turnCount),
    f.band || "",
    f.title || "",
    f.booked ? "あり" : "なし",
    clip_(f.summary),
    clip_(stringifyScoring_(f.scoring)),
    clip_(f.transcript),
    clip_(stringifyExtra_(f.extra)),
  ]);
}

function patchRow_(sheet, row, f) {
  if (f.sid) sheet.getRange(row, COL.SID).setValue(f.sid);
  if (f.status != null) sheet.getRange(row, COL.STATUS).setValue(f.status);
  if (f.startedAt) {
    var curStarted = sheet.getRange(row, COL.STARTED).getValue();
    if (!curStarted) sheet.getRange(row, COL.STARTED).setValue(f.startedAt);
  }
  if (f.updatedAt) sheet.getRange(row, COL.UPDATED).setValue(f.updatedAt);
  if (f.turnCount != null && f.turnCount !== "") {
    sheet.getRange(row, COL.TURNS).setValue(Number(f.turnCount));
  }
  if (f.band != null && f.band !== "") sheet.getRange(row, COL.BAND).setValue(f.band);
  if (f.title != null && f.title !== "") sheet.getRange(row, COL.TITLE).setValue(f.title);
  if (f.booked != null && f.booked !== "") {
    sheet.getRange(row, COL.BOOKED).setValue(f.booked === true || f.booked === "あり" ? "あり" : "なし");
  }
  if (f.summary != null && f.summary !== "") sheet.getRange(row, COL.SUMMARY).setValue(clip_(f.summary));
  if (f.scoring != null && f.scoring !== "") {
    sheet.getRange(row, COL.SCORING).setValue(clip_(stringifyScoring_(f.scoring)));
  }
  if (f.transcript != null && f.transcript !== "") {
    sheet.getRange(row, COL.TRANSCRIPT).setValue(clip_(f.transcript));
  }
  if (f.extra != null) sheet.getRange(row, COL.EXTRA).setValue(clip_(stringifyExtra_(f.extra)));
}

function buildExtra_(body, base) {
  var extra = base ? Object.assign({}, base) : {};
  var keys = Object.keys(body || {});
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (k === "secret" || k === "action") continue;
    // 列に直接載せるもの以外はその他へ（leadId は常に残す）
    if (
      k === "sid" ||
      k === "startedAt" ||
      k === "lastTouchedAt" ||
      k === "turnCount" ||
      k === "band" ||
      k === "title" ||
      k === "booked" ||
      k === "summary" ||
      k === "transcript" ||
      k === "scoring" ||
      k === "since"
    ) {
      continue;
    }
    extra[k] = body[k];
  }
  if (body.lastTouchedAt != null) extra.lastTouchedAt = body.lastTouchedAt;
  return extra;
}

function mergeExtra_(sheet, row, incoming) {
  var prev = {};
  try {
    var raw = String(sheet.getRange(row, COL.EXTRA).getValue() || "");
    if (raw) prev = JSON.parse(raw);
  } catch (e) {
    prev = {};
  }
  return Object.assign({}, prev, incoming || {});
}

function stringifyExtra_(obj) {
  try {
    return JSON.stringify(obj || {});
  } catch (e) {
    return "{}";
  }
}

function stringifyScoring_(scoring) {
  if (scoring == null || scoring === "") return "";
  if (typeof scoring === "string") return scoring;
  try {
    return JSON.stringify(scoring);
  } catch (e) {
    return "";
  }
}

function parseScoringCell_(v) {
  if (v == null || v === "") return null;
  if (typeof v === "object") return v;
  try {
    return JSON.parse(String(v));
  } catch (e) {
    return null;
  }
}

function clip_(value) {
  var s = value == null ? "" : String(value);
  if (s.length <= CELL_MAX) return s;
  var mark = "［以下省略］";
  return s.slice(0, CELL_MAX - mark.length) + mark;
}

function toDate_(v) {
  if (v == null || v === "") return null;
  if (Object.prototype.toString.call(v) === "[object Date]") return v;
  var n = Number(v);
  if (isFinite(n) && n > 0) return new Date(n);
  var t = Date.parse(String(v));
  return isFinite(t) ? new Date(t) : null;
}

function cellToMs_(v) {
  if (v == null || v === "") return null;
  if (Object.prototype.toString.call(v) === "[object Date]") return v.getTime();
  if (typeof v === "number" && isFinite(v)) return v;
  var t = Date.parse(String(v));
  return isFinite(t) ? t : null;
}

function parseSince_(since) {
  if (since == null || since === "") return 0;
  if (typeof since === "number" && isFinite(since)) return since;
  var s = String(since);
  if (/^\d+$/.test(s)) return Number(s);
  var t = Date.parse(s);
  return isFinite(t) ? t : null;
}

function toBool_(v) {
  return v === true || v === "TRUE" || v === "true" || v === 1 || v === "1" || v === "あり";
}

function parseBody_(e) {
  if (!e || !e.postData || !e.postData.contents) return {};
  return JSON.parse(e.postData.contents);
}

function checkSecret_(body) {
  var expected = PropertiesService.getScriptProperties().getProperty("GAS_SHARED_SECRET") || "";
  var got = body && body.secret != null ? String(body.secret) : "";
  return expected !== "" && got === expected;
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
