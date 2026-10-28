/**
 * セキュリティ壁打ちバディ：メール文面の追加（貼り付け用）
 *
 * 【重要】
 * - このファイルはリポジトリ上の「貼り付け用」です。Apps Script エディタへ手動で反映してください。
 * - 既存の doPost は上書きしないでください。action 名は増やしません
 *   （start / verified / complete / abandoned のまま）。
 * - サーバーは variant が "security" のときだけ、JSON に variant を付けます。
 *   既存の壁打ち（variant なし）のペイロードは変えていません。
 * - FooDXは助言者です。メールも、設定代行や復旧、その結果の責任を引き受けない文面にしてください。
 *
 * サーバーが送るもの（security のときだけ variant が付く）:
 *   start     … 既存の項目に加え variant:"security" と verifyUrl（/kabeuchi/security/?t=...）
 *   verified  … { action:"verified", leadId, variant:"security" }
 *   complete  … 既存の complete に variant:"security" と bookingUrl
 *   abandoned … 既存の abandoned に variant:"security"（メールは送らない）
 *
 * Code.gs（壁打ちログ）を使っている場合、variant は「その他」列の JSON に入ります。
 * 新しい列は必須ではありません。
 */

/**
 * 【必須】関数を貼っただけでは件名・本文は変わりません。
 * サーバーは variant:"security" と /kabeuchi/security/?t= の URL を送っています。
 * 件名が「壁打ちバディの開始リンク」のままなら、次の1行が入っていません。
 *
 * --- Code.gs の sendStartMail_ の先頭（var to = ... の直前）に1行足す ---
 *
 * function sendStartMail_(body) {
 *   if (String(body.variant || "") === "security") return sendSecurityStartMail_(body);
 *   var to = String(body.email || "").trim();
 *   ...
 * }
 *
 * これが最短です。security.gs を追加して再デプロイしただけでは、既存の
 * sendStartMail_ がそのまま呼ばれ、URL だけが security になります。
 *
 * --- 別案: handleStart_ の呼び出し側を分ける ---
 *
 *   // 変更前: sendStartMail_(body);
 *   if (String(body.variant || "") === "security") sendSecurityStartMail_(body);
 *   else sendStartMail_(body);
 *
 * メール失敗で受付全体を落とさない try/catch は、既存のまま残してください。
 *
 * --- complete の成功後（upsertSessionRow_ が { ok:true } を返す直前） ---
 *
 *   if (String(body.variant || "") === "security" && status === "完了") {
 *     try {
 *       sendSecurityChecklistMail_(sheet, row, body);
 *     } catch (mailErr) {
 *       // シート記録は成功のまま。本文はログに出さない
 *     }
 *   }
 *
 * row は、その complete で更新または追加した行番号です。
 * abandoned（離脱）では呼びません。
 *
 * シートの「その他」列が Code.gs と違う場合は、sendSecurityChecklistMail_ の
 * 列番号（下記は 12）を既存の列に合わせてください。
 */

var SECURITY_BOOKING_FALLBACK = "https://www.foodx.co.jp/contact?topic=" + encodeURIComponent("セキュリティ壁打ち");

function sendSecurityStartMail_(body) {
  var to = String(body.email || "").trim();
  var url = String(body.verifyUrl || "").trim();
  if (!to || !url) return;
  var name = String(body.name || "").trim();
  var greeting = name ? name + " 様" : "ご担当者様";
  MailApp.sendEmail({
    to: to,
    subject: "【FooDX】セキュリティ壁打ちの開始リンク",
    body:
      greeting + "\n\n" +
      "セキュリティ壁打ちバディのお申し込みありがとうございます。\n" +
      "FooDXは、お店のセキュリティについて助言します。設定の変更や復旧作業、その結果の責任は負いません。\n\n" +
      "次のリンクから、30分以内に壁打ちを開始してください。\n\n" +
      url + "\n\n" +
      "パスワード、カード番号、管理画面のURLは、会話の中でも入力しないでください。\n\n" +
      "※このメールに心当たりがない場合は破棄してください。\n" +
      "FooDX合同会社\n",
  });
}

/**
 * 点検票メール。宛先は start 時に「その他」へ残した email を使う
 * （complete の本文にはメールアドレスを載せない）。
 * extra 列は Code.gs の COL.EXTRA（12）。違うレイアウトなら数字を直す。
 */
function sendSecurityChecklistMail_(sheet, row, body) {
  if (String(body.variant || "") !== "security") return;
  var extra = readSecurityExtra_(sheet, row);
  var to = String(extra.email || "").trim();
  var summary = String(body.summary || "").trim();
  if (!to || !summary) return;
  var name = String(extra.name || "").trim();
  var greeting = name ? name + " 様" : "ご担当者様";
  var booking = String(body.bookingUrl || SECURITY_BOOKING_FALLBACK).trim();
  MailApp.sendEmail({
    to: to,
    subject: "【FooDX】セキュリティ壁打ちの点検票",
    body:
      greeting + "\n\n" +
      "セキュリティ壁打ちの点検票をお送りします。\n" +
      "設定の変更や復旧は、FooDXでは行いません。作業とその結果は、お店の側でご判断ください。\n\n" +
      summary + "\n\n" +
      "進め方を相談したい場合は、次のページからご連絡ください。相談は助言までです。\n" +
      booking + "\n\n" +
      "FooDX合同会社\n",
  });
}

function readSecurityExtra_(sheet, row) {
  var EXTRA_COL = 12; // Code.gs の「その他」。列が違えばここだけ変える
  try {
    var raw = String(sheet.getRange(row, EXTRA_COL).getValue() || "");
    if (!raw) return {};
    var parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (e) {
    return {};
  }
}

/**
 * 【貼り付け手順】
 * 1. 既存の壁打ち用 Apps Script を開く（Code.gs があるプロジェクト）
 * 2. 新規ファイル security.gs を追加し、本ファイルの関数（コメント以外）を貼る
 * 3. Code.gs の sendStartMail_ 先頭に、次の1行を足す（これがないと件名が既存のまま）:
 *      if (String(body.variant || "") === "security") return sendSecurityStartMail_(body);
 * 4. complete が成功したあと、status が「完了」かつ variant が security のときだけ
 *    sendSecurityChecklistMail_ を呼ぶ（失敗しても ok:true のまま）
 * 5. doPost に新しい action は足さない
 * 6. Web アプリを新しいバージョンでデプロイする
 * 7. テスト: security の start → 件名「【FooDX】セキュリティ壁打ちの開始リンク」
 *    ＋ URL が /kabeuchi/security/?t=
 * 8. テスト: 既存 /kabeuchi/ の start → 件名はいままでどおり
 * 9. テスト: security の complete → 点検票メール。既存の complete では届かない
 *
 * 既存コードに合わせて調整が必要です。列番号と、メールを呼ぶ位置は環境依存です。
 */
