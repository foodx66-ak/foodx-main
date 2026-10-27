/**
 * 壁打ちバディ：会話ログのエクスポート（貼り付け用）
 *
 * 【重要】
 * - リポジトリ上の「貼り付け用」です。Apps Script へ手動反映してください。
 * - 既存の doPost / シート列を見ていないため一般例です。**既存コードに合わせて調整が必要**です。
 *
 * 期待する POST JSON:
 *   { secret, action: "export", since: "<ISO8601 or ms>" }
 * 成功レスポンス:
 *   { ok: true, rows: [ { sid, status, startedAt, turnCount, band, title, booked, transcript, summary, scoring }, ... ] }
 *
 * 照合: 既存の GAS_SHARED_SECRET 相当と payload.secret を比較すること
 */

var SHEET_NAME = "壁打ちログ"; // ← 既存シート名に合わせて変更

// 列インデックス（1始まり）— abandoned.gs の例に合わせた想定。実シートに合わせて直すこと。
var COL = {
  SID: 1,
  STATUS: 2,
  LEAD_ID: 3,
  STARTED: 4,
  LAST: 5,
  TURNS: 6,
  BAND: 7,
  TITLE: 8,
  SUMMARY: 9,
  TRANSCRIPT: 10,
  SCORING: 11,
  UPDATED: 12,
  BOOKED: 13, // なければ 0 のまま（面談予約の有無）。列が無い場合は常に false
};

/**
 * 既存 doPost への組み込み例:
 *
 *   if (body.action === "export") {
 *     return jsonOut_(handleExport_(body));
 *   }
 */

function handleExport_(body) {
  if (!body || body.action !== "export") return { ok: false, error: "bad_action" };
  var sinceMs = parseSince_(body.since);
  if (sinceMs == null) return { ok: false, error: "bad_since" };

  var sheet = getLogSheet_();
  var last = sheet.getLastRow();
  if (last < 2) return { ok: true, rows: [] };

  var width = Math.max(sheet.getLastColumn(), 12);
  var values = sheet.getRange(2, 1, last - 1, width).getValues();
  var rows = [];

  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var started = cellToMs_(row[COL.STARTED - 1]);
    var updated = cellToMs_(row[COL.UPDATED - 1]);
    var anchor = updated != null ? updated : started;
    if (anchor == null || anchor < sinceMs) continue;

    var booked = false;
    if (COL.BOOKED > 0 && row.length >= COL.BOOKED) {
      var b = row[COL.BOOKED - 1];
      booked = b === true || b === "TRUE" || b === "true" || b === 1 || b === "1" || b === "あり";
    }

    rows.push({
      sid: String(row[COL.SID - 1] || ""),
      status: String(row[COL.STATUS - 1] || ""),
      startedAt: started,
      turnCount: Number(row[COL.TURNS - 1] || 0),
      band: String(row[COL.BAND - 1] || ""),
      title: String(row[COL.TITLE - 1] || ""),
      booked: booked,
      transcript: String(row[COL.TRANSCRIPT - 1] || ""),
      summary: String(row[COL.SUMMARY - 1] || ""),
      scoring: parseScoringCell_(row[COL.SCORING - 1]),
    });
  }

  return { ok: true, count: rows.length, rows: rows };
}

function parseSince_(since) {
  if (since == null || since === "") return 0;
  if (typeof since === "number" && isFinite(since)) return since;
  var s = String(since);
  if (/^\d+$/.test(s)) return Number(s);
  var t = Date.parse(s);
  return isFinite(t) ? t : null;
}

function cellToMs_(v) {
  if (v == null || v === "") return null;
  if (Object.prototype.toString.call(v) === "[object Date]") return v.getTime();
  if (typeof v === "number" && isFinite(v)) return v;
  var t = Date.parse(String(v));
  return isFinite(t) ? t : null;
}

function parseScoringCell_(v) {
  if (v == null || v === "") return null;
  if (typeof v === "object") return v;
  try {
    return JSON.parse(String(v));
  } catch (e) {
    return { raw: String(v).slice(0, 500) };
  }
}

function getLogSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error("sheet_not_found:" + SHEET_NAME);
  return sheet;
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * 【貼り付け手順】
 * 1. 既存の壁打ち用 Apps Script を開く
 * 2. export.gs を追加（または既存ファイルに合流）
 * 3. doPost に action === "export" 分岐を追加（上記コメント例）
 * 4. COL / SHEET_NAME を実シートに合わせる（面談予約列が無ければ BOOKED=0）
 * 5. シークレット照合が既存と同じか確認
 * 6. テスト: { action:"export", since:"1970-01-01T00:00:00.000Z", secret:"..." } で rows が返ること
 * 7. 必要なら Web アプリを再デプロイ（URL 変更時は Vercel / GitHub の GAS_WEBHOOK_URL を更新）
 *
 * 既存コードに合わせて調整が必要です。
 */
