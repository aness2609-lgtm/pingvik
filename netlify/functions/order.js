// PINGVIK — обробник замовлень.
// Приймає POST з сайту, надсилає замовлення у Telegram-групу (і, за бажанням, у KeyCRM).
// Токен та chat_id зберігаються у змінних оточення Netlify — у коді сайту їх немає.

exports.handler = async (event) => {
  // дозволяємо лише POST
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const TG_TOKEN = process.env.TG_TOKEN;
  const TG_CHAT_ID = process.env.TG_CHAT_ID;
  const KEYCRM_URL = process.env.KEYCRM_URL || ""; // необов'язково

  if (!TG_TOKEN || !TG_CHAT_ID) {
    return { statusCode: 500, body: "Server not configured" };
  }

  let data;
  try {
    data = JSON.parse(event.body || "{}");
  } catch (e) {
    return { statusCode: 400, body: "Bad JSON" };
  }

  // м'яка перевірка обов'язкових полів
  const buyer = data.buyer || {};
  if (!buyer.full_name || !buyer.phone) {
    return { statusCode: 400, body: "Missing buyer" };
  }

  // формуємо гарний текст для Telegram
  const esc = (s) => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const money = (n) => (Number(n) || 0).toLocaleString("uk-UA") + " грн";

  let lines = [];
  lines.push("🐧 <b>НОВЕ ЗАМОВЛЕННЯ — PINGVIK kids</b>");
  lines.push("");
  (data.products || []).forEach((p) => {
    let extra = [];
    if (p.color) extra.push(esc(p.color));
    if (p.size) extra.push("р." + esc(p.size));
    if (p.warmth) extra.push(esc(p.warmth));
    if (p.addon) extra.push("+ " + esc(p.addon));
    if (p.style) extra.push(esc(p.style));
    if (p.print) extra.push("✏️ " + esc(p.print));
    const kit = p.kit ? " [" + esc(p.kit) + "]" : "";
    const meta = extra.length ? " (" + extra.join(", ") + ")" : "";
    lines.push(`• ${esc(p.name)}${kit}${meta} × ${p.qty || 1} — ${money(p.price * (p.qty || 1))}`);
  });
  lines.push("");
  lines.push(`💰 <b>Разом: ${money(data.total)}</b>`);
  lines.push("");
  lines.push(`👤 ${esc(buyer.full_name)}`);
  lines.push(`📞 ${esc(buyer.phone)}`);
  const d = data.delivery || {};
  if (d.city) lines.push(`🏙 ${esc(d.city)}`);
  if (d.nova_poshta) lines.push(`📦 НП: ${esc(d.nova_poshta)}`);
  if (data.print_name) lines.push(`✨ Принт: ${esc(data.print_name)}`);
  if (data.payment) lines.push(`💳 Оплата: ${esc(data.payment)}`);
  if (data.comment) lines.push(`📝 ${esc(data.comment)}`);

  const text = lines.join("\n");

  // 1) надсилаємо в Telegram-групу
  try {
    const tgResp = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TG_CHAT_ID,
        text: text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    const tgJson = await tgResp.json();
    if (!tgJson.ok) {
      return { statusCode: 502, body: "Telegram error: " + (tgJson.description || "unknown") };
    }
  } catch (e) {
    return { statusCode: 502, body: "Telegram request failed" };
  }

  // 2) необов'язково: дублюємо в KeyCRM, якщо задано URL
  if (KEYCRM_URL) {
    try {
      await fetch(KEYCRM_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    } catch (e) {
      // не валимо замовлення, якщо CRM недоступна — головне, що воно вже в Telegram
    }
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ok: true }),
  };
};
