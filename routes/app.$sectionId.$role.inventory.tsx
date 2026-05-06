import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus, Search, ScanLine, Edit2, Trash2, Package, AlertTriangle, Printer, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { db, addOrUpdateProductStock, type SectionId, type ProductRecord } from "@/lib/db";
import { useSection, canAccess } from "@/contexts/AppContext";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import { NeonButton } from "@/components/galaxy/NeonButton";
import { FormModal } from "@/components/galaxy/FormModal";
import { FormField, FormSection, FieldGrid, TextInput, SelectInput, TextArea } from "@/components/galaxy/FormField";
import { BarcodePrintModal } from "@/components/galaxy/BarcodePrintModal";
import { generateBarcode, isAutoBarcode } from "@/lib/barcode";
import { formatDZD } from "@/lib/printing";
import { ProductImagePicker } from "@/components/galaxy/ProductImagePicker";

export const Route = createFileRoute("/app/$sectionId/$role/inventory")({
  component: InventoryPage,
});

const UNITS_BY_SECTION: Record<SectionId, string[]> = {
  supermarket: ["unit", "kg", "box", "bundle"],
  hardware: ["unit", "piece", "kg", "bucket", "meter", "bundle"],
  factory: ["unit", "piece", "kg", "bucket", "meter", "bundle"],
  clothing: ["unit", "piece"],
  repair: ["unit", "piece"],
};

function InventoryPage() {
  const { t } = useTranslation();
  const { sectionId, role } = useSection();
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ProductRecord | null>(null);
  const [printingBarcode, setPrintingBarcode] = useState<ProductRecord | null>(null);

  const products = useLiveQuery(
    () => db.products.where("section").equals(sectionId).reverse().sortBy("updatedAt"),
    [sectionId],
  );

  useBarcodeScanner((code) => {
    setSearch(code);
    toast.info(`${t("inventory.scan_barcode")}: ${code}`);
  });

  const filtered = useMemo(() => {
    if (!products) return [];
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) => p.barcode.toLowerCase().includes(q) || p.name.toLowerCase().startsWith(q) || p.name.toLowerCase().includes(q),
    );
  }, [products, search]);

  const lowStockCount = products?.filter((p) => p.quantity <= (p.minStock || 5)).length ?? 0;

  const isAdmin = canAccess(role, "dashboard");
  const canEdit = role === "admin";

  const handleDelete = (id: number) => {
    toast(t("common.are_you_sure"), {
      action: {
        label: t("actions.delete", { defaultValue: "حذف" }),
        onClick: async () => {
          await db.products.delete(id);
          toast.success(t("common.deleted"));
        },
      },
      duration: 5000,
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl md:text-3xl font-bold text-gradient-galaxy flex items-center gap-3">
          <Package className="h-7 w-7 text-primary" /> {t("inventory.title")}
        </h1>
        {canEdit && (
          <NeonButton variant="primary" onClick={() => { setEditing(null); setShowForm(true); }}>
            <Plus className="h-5 w-5" /> {t("inventory.add_product")}
          </NeonButton>
        )}
      </div>

      {lowStockCount > 0 && (
        <div className="glass-card rounded-xl p-3 flex items-center gap-3 border-warning/40 bg-warning/5">
          <AlertTriangle className="h-5 w-5 text-warning animate-neon-pulse" />
          <span className="text-sm">
            {t("inventory.low_stock_alert")}: <b className="text-warning">{lowStockCount}</b>
          </span>
        </div>
      )}

      <div className="glass-card rounded-2xl p-3">
        <div className="relative">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("inventory.search_placeholder")}
            className="w-full h-12 ps-10 pe-12 rounded-xl bg-input border border-border focus:outline-none focus:border-primary"
          />
          <ScanLine className="absolute end-3 top-1/2 -translate-y-1/2 h-5 w-5 text-accent animate-neon-pulse" />
        </div>
      </div>

      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider">
              <tr>
                <th className="px-3 py-3 text-start">{t("inventory.barcode")}</th>
                <th className="px-3 py-3 text-start">{t("inventory.name")}</th>
                <th className="px-3 py-3 text-start hidden md:table-cell">{t("inventory.unit")}</th>
                <th className="px-3 py-3 text-end">{t("inventory.quantity")}</th>
                {isAdmin && <th className="px-3 py-3 text-end hidden lg:table-cell">{t("inventory.purchase_price")}</th>}
                <th className="px-3 py-3 text-end">{t("inventory.selling_price")}</th>
                {isAdmin && <th className="px-3 py-3 text-end hidden lg:table-cell">{t("inventory.unit_profit")}</th>}
                <th className="px-3 py-3 text-center">{t("actions.print")}</th>
                {canEdit && <th className="px-3 py-3 text-center">{t("actions.edit")}</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={canEdit ? 9 : 8} className="text-center py-12 text-muted-foreground">
                    {t("common.no_data")}
                  </td>
                </tr>
              ) : (
                filtered.map((p) => {
                  const isLow = p.quantity <= (p.minStock || 5);
                  const auto = isAutoBarcode(p.barcode);
                  return (
                    <tr key={p.id} className={`border-t border-border/40 hover:bg-muted/20 ${isLow ? "bg-warning/5" : ""}`}>
                      <td className="px-3 py-3 font-mono text-xs">
                        {p.barcode}
                        {auto && (
                          <div className="inline-flex items-center gap-1 ms-2 px-1.5 py-0.5 rounded bg-accent/20 text-accent text-[10px] font-bold">
                            <Sparkles className="h-3 w-3" /> {t("barcode.auto_generated")}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 font-semibold">
                        <div className="flex items-center gap-2">
                          {p.imageUrl ? (
                            <img
                              src={p.imageUrl}
                              alt={p.name}
                              className="h-10 w-10 rounded-lg object-cover border border-border flex-shrink-0"
                              loading="lazy"
                            />
                          ) : (
                            <div className="h-10 w-10 rounded-lg bg-muted/40 border border-border flex items-center justify-center flex-shrink-0">
                              <Package className="h-4 w-4 text-muted-foreground/40" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="truncate">{p.name}</div>
                            {p.brand && <div className="text-xs text-muted-foreground">{p.brand} {p.size && `• ${p.size}`} {p.color && `• ${p.color}`}</div>}
                            {p.expiryDate && (() => {
                              const days = Math.floor((p.expiryDate - Date.now()) / 86400000);
                              if (days < 0) return <div className="inline-block mt-1 px-1.5 py-0.5 rounded bg-destructive/20 text-destructive text-[10px] font-bold">⚠ {t("inventory.expired", { defaultValue: "Expired" })}</div>;
                              if (days <= 30) return <div className="inline-block mt-1 px-1.5 py-0.5 rounded bg-warning/20 text-warning text-[10px] font-bold">⏳ {t("inventory.expires_in_days", { defaultValue: "Expires in {{days}} days", days })}</div>;
                              return null;
                            })()}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 hidden md:table-cell text-muted-foreground">{t(`units.${p.unit}`, { defaultValue: p.unit })}</td>
                      <td className={`px-3 py-3 text-end font-bold ${isLow ? "text-warning" : ""}`}>{p.quantity}</td>
                      {isAdmin && <td className="px-3 py-3 text-end hidden lg:table-cell">{formatDZD(p.purchasePrice)}</td>}
                      <td className="px-3 py-3 text-end font-semibold text-accent">{formatDZD(p.sellingPrice)}</td>
                      {isAdmin && <td className="px-3 py-3 text-end hidden lg:table-cell text-success">{formatDZD(p.sellingPrice - p.purchasePrice)}</td>}
                      <td className="px-3 py-3 text-center">
                        <button
                          onClick={() => setPrintingBarcode(p)}
                          title={t("barcode.print")}
                          className="p-2 rounded-lg hover:bg-accent/20 text-accent transition"
                        >
                          <Printer className="h-4 w-4" />
                        </button>
                      </td>
                      {canEdit && (
                        <td className="px-3 py-3">
                          <div className="flex items-center justify-center gap-2">
                            <button onClick={() => { setEditing(p); setShowForm(true); }} className="p-2 rounded-lg hover:bg-primary/20 text-primary">
                              <Edit2 className="h-4 w-4" />
                            </button>
                            <button onClick={() => handleDelete(p.id!)} className="p-2 rounded-lg hover:bg-destructive/20 text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && canEdit && (
        <ProductFormModal
          sectionId={sectionId}
          product={editing}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onPrintBarcode={(p) => setPrintingBarcode(p)}
        />
      )}

      {printingBarcode && (
        <BarcodePrintModal product={printingBarcode} onClose={() => setPrintingBarcode(null)} />
      )}
    </div>
  );
}

function ProductFormModal({
  sectionId,
  product,
  onClose,
  onPrintBarcode,
}: {
  sectionId: SectionId;
  product: ProductRecord | null;
  onClose: () => void;
  onPrintBarcode: (p: ProductRecord) => void;
}) {
  const { t } = useTranslation();
  const isEdit = !!product;
  const units = UNITS_BY_SECTION[sectionId];

  const [form, setForm] = useState({
    barcode: product?.barcode ?? "",
    name: product?.name ?? "",
    category: product?.category ?? "",
    unit: product?.unit ?? units[0],
    size: product?.size ?? "",
    color: product?.color ?? "",
    brand: product?.brand ?? "",
    deviceType: product?.deviceType ?? "",
    deviceCode: product?.deviceCode ?? "",
    purchasePrice: product?.purchasePrice ?? 0,
    sellingPrice: product?.sellingPrice ?? 0,
    quantity: product?.quantity ?? 0,
    addQuantity: 0,
    minStock: product?.minStock ?? 5,
    notes: product?.notes ?? "",
    expiryDate: product?.expiryDate ? new Date(product.expiryDate).toISOString().slice(0, 10) : "",
    imageUrl: product?.imageUrl ?? "",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = t("validation.required");
    if (form.sellingPrice <= 0) e.sellingPrice = t("validation.must_be_positive");
    if (form.purchasePrice < 0) e.purchasePrice = t("validation.min_value", { min: 0 });
    if (!isEdit && form.quantity < 0) e.quantity = t("validation.min_value", { min: 0 });
    if (isEdit && form.addQuantity < 0) e.addQuantity = t("validation.min_value", { min: 0 });
    setErrors(e);
    return e;
  };

  const submit = async () => {
    const errs = validate();
    const errCount = Object.keys(errs).length;
    if (errCount > 0) {
      toast.error(
        errCount === 1
          ? t("validation.fields_missing_one")
          : t("validation.fields_missing_other", { count: errCount }),
      );
      return;
    }

    const now = Date.now();
    // باركود اختياري — توليد تلقائي إذا فارغ
    const finalBarcode = form.barcode.trim() || generateBarcode(sectionId);
    const wasAutoGenerated = !form.barcode.trim();

    if (isEdit && product) {
      const newQty = form.addQuantity > 0 ? product.quantity + form.addQuantity : form.quantity;
      const purchasePrice = Math.max(product.purchasePrice, form.purchasePrice);
      const sellingPrice = Math.max(product.sellingPrice, form.sellingPrice);
      const priceChanged = purchasePrice !== form.purchasePrice || sellingPrice !== form.sellingPrice;
      const { addQuantity: _ignored, expiryDate, ...rest } = form;
      await db.products.update(product.id!, {
        ...rest,
        barcode: finalBarcode,
        purchasePrice,
        sellingPrice,
        quantity: newQty,
        expiryDate: expiryDate ? new Date(expiryDate).getTime() : null,
        updatedAt: now,
      });
      if (priceChanged && form.addQuantity > 0) toast.info(t("inventory.price_kept_higher"));
      toast.success(t("common.saved"));
      onClose();
    } else {
      await addOrUpdateProductStock({
        section: sectionId,
        barcode: finalBarcode,
        defaults: {
          section: sectionId,
          barcode: finalBarcode,
          name: form.name,
          category: form.category,
          unit: form.unit,
          size: form.size,
          color: form.color,
          brand: form.brand,
          deviceType: form.deviceType,
          deviceCode: form.deviceCode,
          minStock: form.minStock,
          notes: form.notes,
          imageUrl: form.imageUrl || undefined,
          expiryDate: form.expiryDate ? new Date(form.expiryDate).getTime() : null,
          purchasePrice: form.purchasePrice,
          sellingPrice: form.sellingPrice,
          quantity: form.quantity,
        },
        addQuantity: form.quantity,
        newPurchasePrice: form.purchasePrice,
        newSellingPrice: form.sellingPrice,
      });
      toast.success(t("common.saved"));

      // إغلاق النافذة فوراً لتحرير الواجهة، ثم اقتراح طباعة الباركود
      onClose();
      if (wasAutoGenerated) {
        try {
          const newProduct = await db.products
            .where("[section+barcode]")
            .equals([sectionId, finalBarcode])
            .first();
          if (newProduct) {
            toast(t("barcode.print_after_save"), {
              action: {
                label: t("barcode.print"),
                onClick: () => onPrintBarcode(newProduct),
              },
              duration: 6000,
            });
          }
        } catch (err) {
          console.error("post-save barcode prompt failed", err);
        }
      }
    }
  };

  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm({ ...form, [key]: value });
    if (errors[key as string]) setErrors({ ...errors, [key as string]: "" });
  };

  return (
    <FormModal
      title={isEdit ? t("actions.edit") : t("inventory.add_product")}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <NeonButton variant="ghost" onClick={onClose}>{t("actions.cancel")}</NeonButton>
          <NeonButton variant="primary" onClick={submit}>{t("actions.save")}</NeonButton>
        </>
      }
    >
      <FormSection title={t("form_sections.basic_info")}>
        <FieldGrid cols={2}>
          <FormField
            label={t("inventory.barcode")}
            hint={!isEdit ? t("validation.barcode_optional_hint") : undefined}
          >
            <TextInput
              value={form.barcode}
              onChange={(e) => update("barcode", e.target.value)}
              placeholder={t("validation.barcode_optional_hint")}
            />
          </FormField>
          <FormField label={t("inventory.name")} required error={errors.name}>
            <TextInput
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              error={!!errors.name}
              placeholder={t("inventory.name")}
            />
          </FormField>
          <FormField label={t("inventory.category")}>
            <TextInput
              value={form.category}
              onChange={(e) => update("category", e.target.value)}
              placeholder={t("inventory.category")}
            />
          </FormField>
          <FormField label={t("inventory.unit")} required>
            <SelectInput value={form.unit} onChange={(e) => update("unit", e.target.value)}>
              {units.map((u) => <option key={u} value={u}>{t(`units.${u}`, { defaultValue: u })}</option>)}
            </SelectInput>
          </FormField>
        </FieldGrid>
      </FormSection>

      <FormSection title={t("form_sections.pricing")}>
        <FieldGrid cols={2}>
          <FormField
            label={t("inventory.purchase_price")}
            error={errors.purchasePrice}
            hint={isEdit && product ? `${t("inventory.purchase_price")}: ${formatDZD(product.purchasePrice)}` : undefined}
          >
            <TextInput
              type="number"
              step="0.01"
              min={0}
              value={form.purchasePrice}
              onChange={(e) => update("purchasePrice", +e.target.value)}
              error={!!errors.purchasePrice}
            />
          </FormField>
          <FormField
            label={t("inventory.selling_price")}
            required
            error={errors.sellingPrice}
            hint={isEdit && product ? `${t("inventory.selling_price")}: ${formatDZD(product.sellingPrice)}` : undefined}
          >
            <TextInput
              type="number"
              step="0.01"
              min={0}
              value={form.sellingPrice}
              onChange={(e) => update("sellingPrice", +e.target.value)}
              error={!!errors.sellingPrice}
            />
          </FormField>
          <FormField
            label={isEdit ? t("inventory.add_quantity") : t("inventory.quantity")}
            error={errors.quantity || errors.addQuantity}
            hint={isEdit && product ? `${t("inventory.quantity")}: ${product.quantity}` : undefined}
          >
            <TextInput
              type="number"
              min={0}
              value={isEdit ? form.addQuantity : form.quantity}
              onChange={(e) => update(isEdit ? "addQuantity" : "quantity", +e.target.value)}
              error={!!(errors.quantity || errors.addQuantity)}
            />
          </FormField>
          <FormField label={t("inventory.min_stock")} hint={t("inventory.low_stock_alert")}>
            <TextInput
              type="number"
              min={0}
              value={form.minStock}
              onChange={(e) => update("minStock", +e.target.value)}
            />
          </FormField>
          <FormField label={t("inventory.expiry_date", "تاريخ الصلاحية")} hint={t("inventory.expiry_hint", "اختياري — للمنتجات القابلة للانتهاء")}>
            <TextInput
              type="date"
              value={form.expiryDate}
              onChange={(e) => update("expiryDate", e.target.value)}
            />
          </FormField>
        </FieldGrid>

        {/* معاينة ذكية عند التعديل + إضافة كمية */}
        {isEdit && product && form.addQuantity > 0 && (
          <div className="mt-3 rounded-xl p-4 bg-gradient-to-br from-primary/10 via-accent/5 to-primary/10 border border-primary/30 animate-cosmic-in">
            <div className="text-xs font-bold text-primary mb-2 flex items-center gap-1">
              ✨ {t("i18n_extra.inventory_preview_after_save")}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
              <div>
                <div className="text-[10px] text-muted-foreground">{t("i18n_extra.inventory_new_quantity")}</div>
                <div className="font-bold text-success">
                  {product.quantity} + {form.addQuantity} = <span className="text-base">{product.quantity + form.addQuantity}</span>
                </div>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground">{t("i18n_extra.inventory_approved_purchase_price")}</div>
                <div className="font-bold text-accent">
                  {formatDZD(Math.max(product.purchasePrice, form.purchasePrice))}
                  {form.purchasePrice > product.purchasePrice && <span className="text-[10px] ms-1">↑ {t("i18n_extra.inventory_new_badge")}</span>}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground">{t("i18n_extra.inventory_approved_sale_price")}</div>
                <div className="font-bold text-primary neon-text">
                  {formatDZD(Math.max(product.sellingPrice, form.sellingPrice))}
                  {form.sellingPrice > product.sellingPrice ? (
                    <span className="text-[10px] ms-1 text-success">↑ {t("i18n_extra.inventory_new_badge")}</span>
                  ) : form.sellingPrice < product.sellingPrice ? (
                    <span className="text-[10px] ms-1 text-warning">↓ {t("i18n_extra.inventory_kept_old")}</span>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="mt-3 text-xs text-muted-foreground bg-accent/5 border border-accent/20 rounded-xl p-3">
          ℹ️ {t("inventory.price_kept_higher")}
        </div>
      </FormSection>


      {(sectionId === "clothing" || sectionId === "repair") && (
        <FormSection title={t("form_sections.extra_attributes")}>
          <FieldGrid cols={2}>
            {sectionId === "clothing" && (
              <>
                <FormField label={t("inventory.size")}>
                  <TextInput value={form.size} onChange={(e) => update("size", e.target.value)} />
                </FormField>
                <FormField label={t("inventory.color")}>
                  <TextInput value={form.color} onChange={(e) => update("color", e.target.value)} />
                </FormField>
                <FormField label={t("inventory.brand")}>
                  <TextInput value={form.brand} onChange={(e) => update("brand", e.target.value)} />
                </FormField>
              </>
            )}
            {sectionId === "repair" && (
              <>
                <FormField label={t("inventory.device_type")}>
                  <TextInput value={form.deviceType} onChange={(e) => update("deviceType", e.target.value)} />
                </FormField>
                <FormField label={t("inventory.device_code")}>
                  <TextInput value={form.deviceCode} onChange={(e) => update("deviceCode", e.target.value)} />
                </FormField>
              </>
            )}
          </FieldGrid>
        </FormSection>
      )}

      <FormSection title="صورة المنتج">
        <FormField
          label="الصورة (تظهر في الكاشير)"
          hint="اختياري — تساعد البائع على التعرف على المنتج بسرعة"
        >
          <ProductImagePicker
            value={form.imageUrl || undefined}
            onChange={(v) => update("imageUrl", v ?? "")}
          />
        </FormField>
      </FormSection>

      <FormSection title={t("form_sections.additional_notes")}>
        <FormField label={t("expenses.description")}>
          <TextArea value={form.notes} onChange={(e) => update("notes", e.target.value)} />
        </FormField>
      </FormSection>
    </FormModal>
  );
}
