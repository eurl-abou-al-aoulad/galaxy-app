import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLiveQuery } from "dexie-react-hooks";
import { Printer, Download } from "lucide-react";
import { db, type ProductRecord } from "@/lib/db";
import { renderBarcodeSvg, barcodeToPngDataUrl, LABEL_SIZES, type LabelSize } from "@/lib/barcode";
import { FormModal } from "./FormModal";
import { FormField, FieldGrid, SelectInput, TextInput } from "./FormField";
import { NeonButton } from "./NeonButton";
import { formatDZD } from "@/lib/printing";

interface Props {
  product: ProductRecord;
  onClose: () => void;
}

export function BarcodePrintModal({ product, onClose }: Props) {
  const { t } = useTranslation();
  const settings = useLiveQuery(() => db.settings.get(1), []);
  const previewRef = useRef<SVGSVGElement>(null);

  const [copies, setCopies] = useState(1);
  const [size, setSize] = useState<LabelSize>("medium");
  const [showPrice, setShowPrice] = useState(true);
  const [showStoreName, setShowStoreName] = useState(true);
  const [showProductName, setShowProductName] = useState(true);

  const sizeMm = LABEL_SIZES[size];

  // معاينة
  useEffect(() => {
    if (previewRef.current) {
      renderBarcodeSvg(previewRef.current, product.barcode, {
        width: 1.8,
        height: 55,
        fontSize: 14,
      });
    }
  }, [product.barcode]);

  const print = () => {
    const dataUrl = barcodeToPngDataUrl(product.barcode);
    const labelsHtml = Array.from({ length: copies })
      .map(
        () => `
      <div class="label">
        ${showStoreName && settings?.companyName ? `<div class="store">${settings.companyName}</div>` : ""}
        ${showProductName ? `<div class="name">${product.name}</div>` : ""}
        <img src="${dataUrl}" class="barcode" alt="${product.barcode}"/>
        ${showPrice ? `<div class="price">${formatDZD(product.sellingPrice)}</div>` : ""}
      </div>`,
      )
      .join("");

    const win = window.open("", "_blank", "width=800,height=600");
    if (!win) return;
    win.document.write(`
      <!DOCTYPE html><html><head><meta charset="utf-8"><title>Barcode Labels</title>
      <style>
        @page { size: auto; margin: 5mm; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, sans-serif; background: #fff; color: #000; }
        .sheet { display: flex; flex-wrap: wrap; gap: 2mm; padding: 2mm; }
        .label {
          width: ${sizeMm.w}mm; height: ${sizeMm.h}mm;
          border: 1px dashed #ccc;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          padding: 1mm; overflow: hidden; page-break-inside: avoid;
        }
        .store { font-size: 7pt; font-weight: bold; color: #555; line-height: 1; margin-bottom: 0.5mm; text-align: center; }
        .name { font-size: 8pt; font-weight: bold; line-height: 1; margin-bottom: 0.5mm; text-align: center;
                white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
        .barcode { max-width: 100%; max-height: ${Math.max(8, sizeMm.h - 8)}mm; }
        .price { font-size: 9pt; font-weight: 900; color: #000; margin-top: 0.5mm; }
        @media print {
          .label { border: none; }
        }
      </style></head>
      <body><div class="sheet">${labelsHtml}</div>
      <script>window.onload = () => { setTimeout(() => { window.print(); window.close(); }, 200); };</script>
      </body></html>
    `);
    win.document.close();
  };

  const downloadPng = () => {
    const dataUrl = barcodeToPngDataUrl(product.barcode);
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `barcode-${product.barcode}.png`;
    a.click();
  };

  return (
    <FormModal
      title={`${t("barcode.print_title")} — ${product.name}`}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <NeonButton variant="ghost" onClick={onClose}>
            {t("actions.close")}
          </NeonButton>
          <NeonButton variant="accent" onClick={downloadPng}>
            <Download className="h-4 w-4" /> PNG
          </NeonButton>
          <NeonButton variant="primary" onClick={print}>
            <Printer className="h-4 w-4" /> {t("actions.print")}
          </NeonButton>
        </>
      }
    >
      <div className="space-y-5">
        {/* المعاينة */}
        <div className="bg-white rounded-2xl p-6 flex flex-col items-center justify-center border border-border/40">
          {showStoreName && settings?.companyName && (
            <div className="text-xs font-bold text-gray-700 mb-1">{settings.companyName}</div>
          )}
          {showProductName && (
            <div className="text-sm font-bold text-black mb-1 text-center">{product.name}</div>
          )}
          <svg ref={previewRef} />
          {showPrice && (
            <div className="text-base font-black text-black mt-1">{formatDZD(product.sellingPrice)}</div>
          )}
        </div>

        {/* الإعدادات */}
        <FieldGrid cols={2}>
          <FormField label={t("barcode.copies")} hint={t("barcode.copies_hint")}>
            <TextInput
              type="number"
              min={1}
              max={500}
              value={copies}
              onChange={(e) => setCopies(Math.max(1, Math.min(500, +e.target.value || 1)))}
            />
          </FormField>
          <FormField label={t("barcode.label_size")}>
            <SelectInput value={size} onChange={(e) => setSize(e.target.value as LabelSize)}>
              <option value="small">{t("barcode.size_small")} — 30×20mm</option>
              <option value="medium">{t("barcode.size_medium")} — 40×30mm</option>
              <option value="large">{t("barcode.size_large")} — 50×40mm</option>
            </SelectInput>
          </FormField>
        </FieldGrid>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Toggle label={t("barcode.show_store")} checked={showStoreName} onChange={setShowStoreName} />
          <Toggle label={t("barcode.show_name")} checked={showProductName} onChange={setShowProductName} />
          <Toggle label={t("barcode.show_price")} checked={showPrice} onChange={setShowPrice} />
        </div>

        {/* أزرار سريعة لعدد النسخ */}
        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-muted-foreground self-center me-2">{t("barcode.quick_copies")}:</span>
          {[1, 5, 10, 20, 50, 100].map((n) => (
            <button
              key={n}
              onClick={() => setCopies(n)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
                copies === n
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card border-border hover:border-primary"
              }`}
            >
              ×{n}
            </button>
          ))}
        </div>
      </div>
    </FormModal>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 p-3 rounded-xl bg-card border border-border cursor-pointer hover:border-primary transition">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 accent-primary"
      />
      <span className="text-sm font-medium">{label}</span>
    </label>
  );
}
