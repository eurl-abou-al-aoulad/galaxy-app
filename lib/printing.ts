/**
 * أدوات الطباعة الحرارية وA4 وتصدير PDF
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { InvoiceRecord, SettingsRecord } from "./db";

/** العملة الحالية المعروضة — تُحدَّث من الإعدادات */
let CURRENT_CURRENCY = "DZD";

export function setCurrentCurrency(code: string | null | undefined) {
  CURRENT_CURRENCY = (code && code.trim()) || "DZD";
}

export function getCurrentCurrency(): string {
  return CURRENT_CURRENCY;
}

/** تنسيق مبلغ بالعملة المحددة في الإعدادات (الاسم محفوظ تاريخياً) */
export function formatDZD(amount: number, currency?: string): string {
  return new Intl.NumberFormat("fr-DZ", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount) + " " + (currency || CURRENT_CURRENCY);
}

/** ألياس أوضح */
export const formatMoney = formatDZD;

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("fr-DZ", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** طباعة عبر window.print بعد تجهيز عنصر مخفي */
export function printElement(elementId: string) {
  const el = document.getElementById(elementId);
  if (!el) return;
  // إخفاء كل شيء عدا العنصر المطلوب
  const original = document.body.innerHTML;
  const printContents = el.innerHTML;
  document.body.innerHTML = `<div class="print-container">${printContents}</div>`;
  window.print();
  document.body.innerHTML = original;
  // إعادة تحميل لإعادة ربط React
  window.location.reload();
}

/** أبسط: نفتح نافذة جديدة بمحتوى الفاتورة فقط */
export function printInvoiceHtml(html: string, size: "thermal" | "a4") {
  const w = window.open("", "_blank", "width=800,height=600");
  if (!w) return;
  const styles =
    size === "thermal"
      ? `@page { size: 80mm auto; margin: 0; } body { width: 80mm; padding: 4mm; font-family: monospace; font-size: 11px; color: #000; }`
      : `@page { size: A4; margin: 12mm; } body { font-family: Arial, sans-serif; color: #000; font-size: 12px; }`;
  w.document.write(`<!DOCTYPE html><html><head><title>Print</title><style>
    ${styles}
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 4px 6px; text-align: start; }
    .a4 th, .a4 td { border: 1px solid #333; }
    .center { text-align: center; }
    .bold { font-weight: bold; }
    .right { text-align: end; }
    hr { border: none; border-top: 1px dashed #000; margin: 6px 0; }
    h1, h2, h3 { margin: 4px 0; }
  </style></head><body>${html}<script>window.onload=()=>{window.print();setTimeout(()=>window.close(),300);}</script></body></html>`);
  w.document.close();
}

/** بناء HTML الفاتورة الحرارية */
export function thermalReceiptHtml(invoice: InvoiceRecord, settings: SettingsRecord): string {
  const itemsHtml = invoice.items
    .map(
      (it) => `
    <tr>
      <td>${escapeHtml(it.name)}</td>
      <td class="right">${it.quantity}×${it.sellingPrice.toFixed(2)}</td>
      <td class="right">${it.total.toFixed(2)}</td>
    </tr>`,
    )
    .join("");

  return `
    <div class="center bold">${escapeHtml(settings.companyName)}</div>
    ${settings.companyPhone ? `<div class="center">${escapeHtml(settings.companyPhone)}</div>` : ""}
    ${settings.companyAddress ? `<div class="center">${escapeHtml(settings.companyAddress)}</div>` : ""}
    <hr/>
    <div>N°: <span class="bold">${invoice.invoiceNumber}</span></div>
    <div>Date: ${formatDate(invoice.createdAt)}</div>
    ${invoice.customerName ? `<div>Client: ${escapeHtml(invoice.customerName)}</div>` : ""}
    <hr/>
    <table>
      <thead><tr><th>Article</th><th class="right">Qte×P.U</th><th class="right">Total</th></tr></thead>
      <tbody>${itemsHtml}</tbody>
    </table>
    <hr/>
    <div class="right">Sous-total: ${invoice.subtotal.toFixed(2)} ${CURRENT_CURRENCY}</div>
    ${invoice.discount > 0 ? `<div class="right">Remise: -${invoice.discount.toFixed(2)} ${CURRENT_CURRENCY}</div>` : ""}
    ${invoice.tva > 0 ? `<div class="right">TVA: ${invoice.tva.toFixed(2)} ${CURRENT_CURRENCY}</div>` : ""}
    ${invoice.stamp > 0 ? `<div class="right">Timbre: ${invoice.stamp.toFixed(2)} ${CURRENT_CURRENCY}</div>` : ""}
    <div class="right bold" style="font-size: 14px; margin-top: 4px;">TOTAL: ${invoice.total.toFixed(2)} ${CURRENT_CURRENCY}</div>
    <div class="right">Payé: ${invoice.paid.toFixed(2)} ${CURRENT_CURRENCY}</div>
    ${invoice.remaining > 0 ? `<div class="right bold">Reste: ${invoice.remaining.toFixed(2)} ${CURRENT_CURRENCY}</div>` : ""}
    <hr/>
    <div class="center">Merci pour votre visite!</div>
    <div class="center" style="font-size: 9px; margin-top: 6px;">GALAXY ACCOUNTING</div>
  `;
}

/** بناء HTML الفاتورة A4 (مع TVA الجزائري) */
export function a4InvoiceHtml(invoice: InvoiceRecord, settings: SettingsRecord): string {
  const itemsHtml = invoice.items
    .map(
      (it, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${escapeHtml(it.name)}</td>
      <td class="center">${it.unit}</td>
      <td class="right">${it.quantity}</td>
      <td class="right">${it.sellingPrice.toFixed(2)}</td>
      <td class="right">${it.total.toFixed(2)}</td>
    </tr>`,
    )
    .join("");

  const typeLabels: Record<string, string> = {
    facture: "FACTURE",
    bon_livraison: "BON DE LIVRAISON",
    bon_commande: "BON DE COMMANDE",
    ticket: "TICKET",
  };

  return `
    <div class="a4">
      <table style="border: none; margin-bottom: 10px;">
        <tr style="border: none;">
          <td style="border: none; width: 60%; vertical-align: top;">
            <div style="display:flex; align-items:center; gap:10px;">
              ${settings.companyLogo ? `<img src="${settings.companyLogo}" style="height:60px; width:60px; object-fit:contain;" />` : ""}
              <div>
                <h2 style="margin:0;">${escapeHtml(settings.companyName)}</h2>
                ${settings.companyAddress ? `<div>${escapeHtml(settings.companyAddress)}</div>` : ""}
                ${settings.companyPhone ? `<div>Tél: ${escapeHtml(settings.companyPhone)}</div>` : ""}
                ${settings.rc ? `<div>RC: ${escapeHtml(settings.rc)}</div>` : ""}
                ${settings.nif ? `<div>NIF: ${escapeHtml(settings.nif)}</div>` : ""}
                ${settings.nic ? `<div>NIC: ${escapeHtml(settings.nic)}</div>` : ""}
                ${settings.ai ? `<div>AI: ${escapeHtml(settings.ai)}</div>` : ""}
              </div>
            </div>
          </td>
          <td style="border: none; text-align: end; vertical-align: top;">
            <h2 style="margin:0;">${typeLabels[invoice.type] || "FACTURE"}</h2>
            <div>N°: <b>${invoice.invoiceNumber}</b></div>
            <div>Date: ${formatDate(invoice.createdAt)}</div>
          </td>
        </tr>
      </table>

      ${
        invoice.customerName
          ? `<div style="border: 1px solid #333; padding: 8px; margin-bottom: 10px;">
              <b>Client:</b> ${escapeHtml(invoice.customerName)}<br/>
              ${invoice.customerPhone ? `Tél: ${escapeHtml(invoice.customerPhone)}<br/>` : ""}
              ${invoice.customerRc ? `RC: ${escapeHtml(invoice.customerRc)} | ` : ""}
              ${invoice.customerNif ? `NIF: ${escapeHtml(invoice.customerNif)} | ` : ""}
              ${invoice.customerNic ? `NIC: ${escapeHtml(invoice.customerNic)} | ` : ""}
              ${invoice.customerAi ? `AI: ${escapeHtml(invoice.customerAi)}` : ""}
            </div>`
          : ""
      }

      <table>
        <thead style="background: #eee;">
          <tr>
            <th>#</th><th>Désignation</th><th>Unité</th>
            <th>Qté</th><th>P.U HT</th><th>Total HT</th>
          </tr>
        </thead>
        <tbody>${itemsHtml}</tbody>
      </table>

      <table style="border: none; margin-top: 10px;">
        <tr style="border: none;"><td style="border: none; width: 60%;"></td>
          <td style="border: none;">
            <table>
              <tr><td>Sous-total HT</td><td class="right">${invoice.subtotal.toFixed(2)}</td></tr>
              ${invoice.discount > 0 ? `<tr><td>Remise</td><td class="right">-${invoice.discount.toFixed(2)}</td></tr>` : ""}
              ${invoice.shipping > 0 ? `<tr><td>Livraison</td><td class="right">${invoice.shipping.toFixed(2)}</td></tr>` : ""}
              ${invoice.labor > 0 ? `<tr><td>Main d'œuvre</td><td class="right">${invoice.labor.toFixed(2)}</td></tr>` : ""}
              ${invoice.tva > 0 ? `<tr><td>TVA (${settings.tvaRate}%)</td><td class="right">${invoice.tva.toFixed(2)}</td></tr>` : ""}
              ${invoice.stamp > 0 ? `<tr><td>Timbre Fiscal (1%)</td><td class="right">${invoice.stamp.toFixed(2)}</td></tr>` : ""}
              <tr style="background:#eee;"><td><b>TOTAL TTC</b></td><td class="right"><b>${invoice.total.toFixed(2)} ${CURRENT_CURRENCY}</b></td></tr>
              <tr><td>Payé</td><td class="right">${invoice.paid.toFixed(2)}</td></tr>
              ${invoice.remaining > 0 ? `<tr><td><b>Reste à payer</b></td><td class="right"><b>${invoice.remaining.toFixed(2)}</b></td></tr>` : ""}
            </table>
          </td>
        </tr>
      </table>

      ${invoice.notes ? `<div style="margin-top: 15px; border-top: 1px solid #999; padding-top: 8px;"><b>Notes:</b> ${escapeHtml(invoice.notes)}</div>` : ""}

      <div style="margin-top: 30px; text-align: center; font-size: 10px; color: #666;">
        Document généré par THE GALAXY ACCOUNTING SOFTWARE
      </div>
    </div>
  `;
}

export function exportInvoicePDF(invoice: InvoiceRecord, settings: SettingsRecord) {
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text(settings.companyName, 14, 20);
  doc.setFontSize(10);
  if (settings.companyAddress) doc.text(settings.companyAddress, 14, 26);
  if (settings.companyPhone) doc.text(`Tel: ${settings.companyPhone}`, 14, 31);
  // Company fiscal info
  const compFiscal: string[] = [];
  if (settings.rc) compFiscal.push(`RC: ${settings.rc}`);
  if (settings.nif) compFiscal.push(`NIF: ${settings.nif}`);
  if (settings.nic) compFiscal.push(`NIS: ${settings.nic}`);
  if (settings.ai) compFiscal.push(`AI: ${settings.ai}`);
  if (compFiscal.length) doc.text(compFiscal.join("  |  "), 14, 36);

  doc.setFontSize(14);
  doc.text(`Invoice ${invoice.invoiceNumber}`, 140, 20);
  doc.setFontSize(10);
  doc.text(formatDate(invoice.createdAt), 140, 26);

  // Client block
  let clientY = 46;
  if (invoice.customerName) {
    doc.setFontSize(11);
    doc.text(`Client: ${invoice.customerName}`, 14, clientY);
    doc.setFontSize(9);
    if (invoice.customerPhone) {
      clientY += 5;
      doc.text(`Tel: ${invoice.customerPhone}`, 14, clientY);
    }
    const fiscal: string[] = [];
    if (invoice.customerRc) fiscal.push(`RC: ${invoice.customerRc}`);
    if (invoice.customerNif) fiscal.push(`NIF: ${invoice.customerNif}`);
    if (invoice.customerNic) fiscal.push(`NIS: ${invoice.customerNic}`);
    if (invoice.customerAi) fiscal.push(`AI: ${invoice.customerAi}`);
    if (fiscal.length) {
      clientY += 5;
      doc.text(fiscal.join("  |  "), 14, clientY);
    }
  }

  autoTable(doc, {
    startY: Math.max(60, clientY + 6),
    head: [["#", "Désignation", "Unité", "Qté", "P.U", "Total"]],
    body: invoice.items.map((it, i) => [
      i + 1,
      it.name,
      it.unit,
      it.quantity.toString(),
      it.sellingPrice.toFixed(2),
      it.total.toFixed(2),
    ]),
  });

  const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
  const lh = 7; // line-height بين الأسطر لتجنّب التداخل
  let y = finalY;
  doc.setFontSize(10);
  doc.text(`Subtotal: ${invoice.subtotal.toFixed(2)}`, 140, y);
  y += lh;
  if (invoice.tva > 0) {
    doc.text(`TVA: ${invoice.tva.toFixed(2)}`, 140, y);
    y += lh;
  }
  if (invoice.stamp > 0) {
    doc.text(`Timbre: ${invoice.stamp.toFixed(2)}`, 140, y);
    y += lh;
  }
  y += 2;
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text(`TOTAL: ${invoice.total.toFixed(2)} ${CURRENT_CURRENCY}`, 140, y);
  doc.setFont("helvetica", "normal");

  doc.save(`${invoice.invoiceNumber}.pdf`);
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** وصل تسديد دفعة دين — HTML قابل للطباعة */
export function debtPaymentReceiptHtml(params: {
  settings: SettingsRecord;
  customerName: string;
  customerPhone?: string;
  paymentAmount: number;
  paymentDate: number;
  paymentNote?: string;
  totalDebt: number;
  totalPaid: number;
  remaining: number;
  receiptNumber: string;
}): string {
  const s = params.settings;
  return `
    <div style="text-align:center; font-weight:bold; font-size:14px;">${escapeHtml(s.companyName)}</div>
    ${s.companyPhone ? `<div style="text-align:center;">${escapeHtml(s.companyPhone)}</div>` : ""}
    ${s.companyAddress ? `<div style="text-align:center;">${escapeHtml(s.companyAddress)}</div>` : ""}
    <hr/>
    <div style="text-align:center; font-weight:bold; font-size:13px; margin:6px 0;">
      وصل تسديد دين / REÇU DE PAIEMENT
    </div>
    <div>N°: <b>${escapeHtml(params.receiptNumber)}</b></div>
    <div>Date: ${formatDate(params.paymentDate)}</div>
    <hr/>
    <div><b>Client:</b> ${escapeHtml(params.customerName)}</div>
    ${params.customerPhone ? `<div>Tél: ${escapeHtml(params.customerPhone)}</div>` : ""}
    <hr/>
    <table style="width:100%; border-collapse:collapse;">
      <tr><td>إجمالي الدين / Total dette</td><td style="text-align:end;"><b>${params.totalDebt.toFixed(2)} ${CURRENT_CURRENCY}</b></td></tr>
      <tr><td>المدفوع الآن / Payé maintenant</td><td style="text-align:end;"><b>${params.paymentAmount.toFixed(2)} ${CURRENT_CURRENCY}</b></td></tr>
      <tr><td>إجمالي المسدّد / Total payé</td><td style="text-align:end;">${params.totalPaid.toFixed(2)} ${CURRENT_CURRENCY}</td></tr>
      <tr style="border-top:1px dashed #000;">
        <td style="padding-top:4px;"><b>الباقي / Reste</b></td>
        <td style="text-align:end; padding-top:4px;"><b>${params.remaining.toFixed(2)} ${CURRENT_CURRENCY}</b></td>
      </tr>
    </table>
    ${params.paymentNote ? `<hr/><div><b>Note:</b> ${escapeHtml(params.paymentNote)}</div>` : ""}
    <hr/>
    <div style="display:flex; justify-content:space-between; margin-top:20px;">
      <div>توقيع الزبون<br/>Signature client</div>
      <div>توقيع المسؤول<br/>Signature responsable</div>
    </div>
    <div style="text-align:center; margin-top:14px; font-size:10px;">
      ${params.remaining <= 0 ? "✅ تم تسديد الدين بالكامل / Dette totalement réglée" : "شكراً — يرجى الاحتفاظ بهذا الوصل"}
    </div>
  `;
}
