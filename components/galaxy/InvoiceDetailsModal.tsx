import { createPortal } from "react-dom";
import { X, Printer, FileText, User, Calendar, Hash, Package } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { InvoiceRecord, SettingsRecord } from "@/lib/db";
import { formatDZD, formatDate, printInvoiceHtml, thermalReceiptHtml, a4InvoiceHtml, exportInvoicePDF } from "@/lib/printing";

export function InvoiceDetailsModal({
  invoice,
  settings,
  onClose,
}: {
  invoice: InvoiceRecord;
  settings: SettingsRecord;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  const handlePrint = () => {
    const html = invoice.printSize === "thermal" ? thermalReceiptHtml(invoice, settings) : a4InvoiceHtml(invoice, settings);
    printInvoiceHtml(html, invoice.printSize);
  };

  const modal = (
    <div
      className="fixed inset-0 z-[9999] bg-background flex flex-col animate-cosmic-in"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: "100vw",
        height: "100dvh",
      }}
      role="dialog"
      aria-modal="true"
    >
      {/* Header ثابت */}
      <div className="shrink-0 flex items-start justify-between gap-3 px-4 md:px-6 py-3 md:py-4 border-b border-border/40 bg-card/95 backdrop-blur-sm">
        <div className="flex items-center gap-3 min-w-0">
          {settings.companyLogo && (
            <img src={settings.companyLogo} alt="" className="h-12 w-12 md:h-14 md:w-14 object-contain rounded-xl shrink-0" />
          )}
          <div className="min-w-0">
            <h2 className="text-lg md:text-xl font-bold text-gradient-galaxy truncate">{settings.companyName}</h2>
            <p className="text-xs text-muted-foreground truncate">{settings.companyAddress || ""}</p>
            <p className="text-xs text-muted-foreground truncate">{settings.companyPhone || ""}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="p-2 rounded-lg hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors cursor-pointer shrink-0"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* محتوى قابل للتمرير */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 md:px-6 py-4 md:py-5">
        {/* Invoice meta */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <Info icon={Hash} label={t("invoices.invoice_number")} value={invoice.invoiceNumber} />
          <Info icon={FileText} label={t("invoices.type")} value={t(`invoices.${invoice.type}`)} />
          <Info icon={Calendar} label={t("expenses.date")} value={formatDate(invoice.createdAt)} />
          <Info icon={User} label={t("dashboard.invoices_today")} value={invoice.createdBy} />
        </div>

        {/* Customer */}
        {invoice.customerName && (
          <div className="glass-card rounded-xl p-3 mb-4 border-primary/20">
            <h3 className="text-sm font-bold mb-2 flex items-center gap-2"><User className="h-4 w-4 text-primary" />{t("invoices.customer")}</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1 text-xs">
              <div><span className="text-muted-foreground">{t("customers.name")}: </span><b>{invoice.customerName}</b></div>
              {invoice.customerPhone && <div><span className="text-muted-foreground">{t("customers.phone")}: </span>{invoice.customerPhone}</div>}
              {invoice.customerRc && <div><span className="text-muted-foreground">RC: </span>{invoice.customerRc}</div>}
              {invoice.customerNif && <div><span className="text-muted-foreground">NIF: </span>{invoice.customerNif}</div>}
              {invoice.customerNic && <div><span className="text-muted-foreground">NIC: </span>{invoice.customerNic}</div>}
              {invoice.customerAi && <div><span className="text-muted-foreground">AI: </span>{invoice.customerAi}</div>}
            </div>
          </div>
        )}

        {/* Items */}
        <div className="border border-border rounded-xl overflow-hidden mb-4">
          <table className="w-full text-xs">
            <thead className="bg-muted/40">
              <tr>
                <th className="p-2 text-start">#</th>
                <th className="p-2 text-start">{t("inventory.name")}</th>
                <th className="p-2 text-center">{t("inventory.unit")}</th>
                <th className="p-2 text-end">{t("inventory.quantity")}</th>
                <th className="p-2 text-end">{t("inventory.selling_price")}</th>
                <th className="p-2 text-end">{t("invoices.total")}</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((it, i) => (
                <tr key={i} className="border-t border-border/40">
                  <td className="p-2 font-mono text-muted-foreground">{i + 1}</td>
                  <td className="p-2 font-semibold flex items-center gap-2"><Package className="h-3 w-3 text-primary" />{it.name}</td>
                  <td className="p-2 text-center text-muted-foreground">{it.unit}</td>
                  <td className="p-2 text-end">{it.quantity}</td>
                  <td className="p-2 text-end">{formatDZD(it.sellingPrice)}</td>
                  <td className="p-2 text-end font-bold text-accent">{formatDZD(it.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="glass-card rounded-xl p-4 mb-4 space-y-1.5 text-sm">
          <Row label={t("invoices.subtotal")} value={formatDZD(invoice.subtotal)} />
          {invoice.discount > 0 && <Row label={t("invoices.discount")} value={`- ${formatDZD(invoice.discount)}`} className="text-warning" />}
          {invoice.shipping > 0 && <Row label={t("invoices.shipping")} value={formatDZD(invoice.shipping)} />}
          {invoice.labor > 0 && <Row label={t("invoices.labor")} value={formatDZD(invoice.labor)} />}
          {invoice.tva > 0 && <Row label={`${t("invoices.tva")} (${settings.tvaRate}%)`} value={formatDZD(invoice.tva)} />}
          {invoice.stamp > 0 && <Row label={`${t("invoices.stamp")} (1%)`} value={formatDZD(invoice.stamp)} />}
          <div className="h-px bg-border my-1" />
          <Row label={t("invoices.total")} value={formatDZD(invoice.total)} className="text-lg font-bold text-gradient-galaxy" />
          <Row label={t("invoices.paid")} value={formatDZD(invoice.paid)} className="text-success" />
          {invoice.remaining > 0 && <Row label={t("invoices.remaining")} value={formatDZD(invoice.remaining)} className="text-destructive font-bold" />}
        </div>

        {/* Status & Notes */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
          <div className="glass-card rounded-xl p-3 text-xs">
            <span className="text-muted-foreground">{t("invoices.status")}: </span>
            <b className="text-accent">{t(`invoices.status_${invoice.status}`)}</b>
          </div>
          <div className="glass-card rounded-xl p-3 text-xs">
            <span className="text-muted-foreground">{t("invoices.print_thermal")}/A4: </span>
            <b>{invoice.printSize === "thermal" ? "80mm" : "A4"}</b>
          </div>
        </div>

        {invoice.notes && (
          <div className="glass-card rounded-xl p-3 mb-2 text-xs border-warning/20">
            <span className="text-muted-foreground font-semibold">📝 </span>
            <span>{invoice.notes}</span>
          </div>
        )}

        <div className="h-4" />
      </div>

      {/* Footer ثابت — أزرار الإجراءات تبقى مرئية دائماً */}
      <div
        className="shrink-0 px-3 md:px-6 py-3 border-t border-border/40 bg-card/95 backdrop-blur-sm
                   grid grid-cols-1 sm:flex sm:flex-wrap sm:justify-end gap-2 items-stretch"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <button
          onClick={onClose}
          className="h-12 px-5 rounded-xl bg-muted/40 border border-border font-semibold hover:bg-muted w-full sm:w-auto"
        >
          {t("actions.close")}
        </button>
        <button
          onClick={() => exportInvoicePDF(invoice, settings)}
          className="h-12 px-5 rounded-xl bg-gradient-to-br from-accent to-accent/70 text-accent-foreground font-semibold flex items-center justify-center gap-2 hover:brightness-110 w-full sm:w-auto"
        >
          <FileText className="h-4 w-4" /> {t("actions.export_pdf")}
        </button>
        <button
          onClick={handlePrint}
          className="h-12 px-5 rounded-xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground font-semibold flex items-center justify-center gap-2 hover:brightness-110 w-full sm:w-auto"
        >
          <Printer className="h-4 w-4" /> {t("actions.print")}
        </button>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;

  return createPortal(modal, document.body);
}

function Info({ icon: Icon, label, value }: { icon: typeof X; label: string; value: string }) {
  return (
    <div className="glass-card rounded-xl p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className="text-sm font-bold truncate">{value}</div>
    </div>
  );
}

function Row({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className={`flex justify-between ${className}`}>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}
