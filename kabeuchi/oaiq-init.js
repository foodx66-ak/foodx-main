(function (w, d, s, u) {
  if (w.oaiq) return;
  var q = function () { q.q.push(arguments); };
  q.q = []; w.oaiq = q;
  var js = d.createElement(s); js.async = true; js.src = u;
  var f = d.getElementsByTagName(s)[0]; f.parentNode.insertBefore(js, f);
})(window, document, "script", "https://bzrcdn.openai.com/sdk/oaiq.min.js");
oaiq("init", { pixelId: "6Xmv49UzihVK4NnABRnW6b" });
