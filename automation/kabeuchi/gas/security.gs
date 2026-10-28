/**
 * セキュリティAI壁打ちバディ：メール文面の追加（貼り付け用）
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
 * 既存 doPost への足し方（action の分岐は増やさない）:
 *
 * function doPost(e) {
 *   var body = JSON.parse(e.postData.contents);
 *   // …既存の secret 照合…
 *   if (body.action === "start") {
 *     return jsonOut_(handleStart_(body)); // handleStart_ の中だけ変える（下）
 *   }
 *   if (body.action === "verified") {
 *     return jsonOut_(handleVerified_(body)); // 関数の追加は不要。variant は「その他」に残る
 *   }
 *   if (body.action === "complete") {
 *     return jsonOut_(handleComplete_(body)); // 成功したあとに点検票メール（下）
 *   }
 *   // abandoned はメールを足さない
 * }
 *
 * --- handleStart_ のメール箇所を、次の if に変える ---
 *
 *   // 変更前: sendStartMail_(body);
 *   if (String(body.variant || "") === "security") sendSecurityStartMail_(body);
 *   else sendStartMail_(body);
 *
 * Code.gs の sendStartMail_ を呼んでいる行がそれです。
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

var SECURITY_BOOKING_FALLBACK = "https://www.foodx.co.jp/contact?topic=" + encodeURIComponent("セキュリティAI壁打ちバディ");

function sendSecurityStartMail_(body) {
  var to = String(body.email || "").trim();
  var url = String(body.verifyUrl || "").trim();
  if (!to || !url) return;
  var name = String(body.name || "").trim();
  var greeting = name ? name + " 様" : "ご担当者様";
  MailApp.sendEmail({
    to: to,
    subject: "【FooDX】セキュリティAI壁打ちバディの開始リンク",
    body:
      greeting + "\n\n" +
      "セキュリティAI壁打ちバディのお申し込みありがとうございます。\n" +
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
    subject: "【FooDX】セキュリティAI壁打ちバディの点検票",
    body:
      greeting + "\n\n" +
      "セキュリティAI壁打ちバディの点検票をお送りします。\n" +
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
 * 2. 新規ファイル security.gs を追加し、本ファイルの関数を貼る
 * 3. handleStart_ の sendStartMail_ 呼び出しを、上の if に変える
 * 4. complete が成功したあと、status が「完了」かつ variant が security のときだけ
 *    sendSecurityChecklistMail_ を呼ぶ（失敗しても ok:true のまま）
 * 5. doPost に新しい action は足さない。既存の start / verified の処理はそのまま
 * 6. テスト: variant なしの start は、いままでどおり「壁打ちバディの開始リンク」
 * 7. テスト: variant=security の start は、「セキュリティAI壁打ちバディの開始リンク」で
 *    URL が /kabeuchi/security/?t= になる
 * 8. テスト: 同じ行の complete（variant=security）で点検票メールが届く。
 *    variant なしの complete では届かない
 * 9. Web アプリを新しいバージョンでデプロイする（URL が変わる場合は GAS_WEBHOOK_URL を更新）
 *
 * 既存コードに合わせて調整が必要です。列番号と、メールを呼ぶ位置は環境依存です。
 */
