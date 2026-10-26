/**
 * 壁打ちバディ：離脱（abandoned）／完了（complete）のシート反映（貼り付け用）
 *
 * 【重要】
 * - このファイルはリポジトリ上の「貼り付け用」です。Apps Script エディタへ手動で反映してください。
 * - 既存の doPost / シート列構成を見ていないため、下は一般的な組み込み例です。
 *   **既存コードに合わせて調整が必要**です。
 *
 * 期待する POST JSON（共通）:
 *   { secret, action, sid, leadId?, ... }
 * action:
 *   - "abandoned" … 新規行（状態＝離脱）。同じ sid が既にあれば上書きしない／または離脱のまま維持（運用に合わせる）
 *   - "complete"  … 同じ sid の行があれば「状態＝完了」に上書き。なければ新規行
 *
 * 照合: 既存どおり PropertiesService 等の共有シークレットと payload.secret を比較すること
 * （本リポジトリのサーバー側は環境変数 GAS_SHARED_SECRET を送る）
 */

// ===== 例: 列レイアウト（1行目ヘッダ想定） ================================
// A:sid  B:状態  C:leadId  D:開始時刻  E:最終操作  F:往復数  G:規模帯  H:立場
// I:要約  J:会話全文  K:採点JSON  L:更新時刻
// ========================================================================

var SHEET_NAME = "壁打ちログ"; // ← 既存シート名に合わせて変更

/**
 * 既存 doPost(e) への組み込み例:
 *
 * function doPost(e) {
 *   var body = JSON.parse(e.postData.contents);
 *   if (body.secret !== getSharedSecret_()) {
 *     return jsonOut_({ ok: false, error: "unauthorized" });
 *   }
 *   if (body.action === "abandoned") {
 *     return jsonOut_(handleAbandoned_(body));
 *   }
 *   if (body.action === "complete") {
 *     return jsonOut_(handleComplete_(body)); // 既存 complete 処理をこれに置換／合流
 *   }
 *   // …既存の start / verified など…
 *   return jsonOut_({ ok: false, error: "unknown_action" });
 * }
 */

function handleAbandoned_(body) {
  var sheet = getLogSheet_();
  var sid = String(body.sid || "");
  if (!sid) return { ok: false, error: "missing_sid" };

  var row = findRowBySid_(sheet, sid);
  var values = buildRowValues_(body, "離脱");
  if (row > 0) {
    // 既に完了済みなら離脱で潰さない
    var status = String(sheet.getRange(row, 2).getValue() || "");
    if (status === "完了") {
      return { ok: true, skipped: "already_complete" };
    }
    sheet.getRange(row, 1, 1, values.length).setValues([values]);
  } else {
    sheet.appendRow(values);
  }
  return { ok: true };
}

function handleComplete_(body) {
  var sheet = getLogSheet_();
  var sid = String(body.sid || "");
  var values = buildRowValues_(body, "完了");
  if (sid) {
    var row = findRowBySid_(sheet, sid);
    if (row > 0) {
      sheet.getRange(row, 1, 1, values.length).setValues([values]);
      return { ok: true, updated: true };
    }
  }
  sheet.appendRow(values);
  return { ok: true, created: true };
}

function buildRowValues_(body, status) {
  return [
    String(body.sid || ""),
    status,
    String(body.leadId || ""),
    formatTs_(body.startedAt),
    formatTs_(body.lastTouchedAt),
    Number(body.turnCount || 0),
    String(body.band || ""),
    String(body.title || ""),
    String(body.summary || ""),
    String(body.transcript || ""),
    body.scoring != null ? JSON.stringify(body.scoring) : "",
    new Date(),
  ];
}

function findRowBySid_(sheet, sid) {
  var last = sheet.getLastRow();
  if (last < 2) return 0;
  var col = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < col.length; i++) {
    if (String(col[i][0]) === sid) return i + 2;
  }
  return 0;
}

function getLogSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error("sheet_not_found:" + SHEET_NAME);
  return sheet;
}

function formatTs_(ms) {
  if (ms == null || ms === "") return "";
  var n = Number(ms);
  if (!isFinite(n)) return String(ms);
  return new Date(n);
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * 【貼り付け手順】
 * 1. Google Apps Script プロジェクト（既存の壁打ち用）を開く
 * 2. 新規ファイル abandoned.gs を追加し、本ファイルの関数を貼る（または既存 .gs に合流）
 * 3. 既存 doPost に action === "abandoned" / "complete" の分岐を追加（上記コメント例）
 * 4. SHEET_NAME と列順を、いまのシートに合わせて直す
 * 5. 共有シークレット照合が既存と同じか確認する
 * 6. テスト: action=abandoned の POST → 行が「離脱」で増えること
 * 7. 同じ sid で action=complete → その行が「完了」に上書きされること
 * 8. Web アプリの「新しいデプロイ」が必要なら実施（URL が変わる場合は Vercel の GAS_WEBHOOK_URL を更新）
 *
 * 既存コードに合わせて調整が必要です。列名・シート名・シークレット取得方法は環境依存です。
 */
