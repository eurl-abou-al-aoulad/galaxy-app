import { useState, useMemo, useEffect, useRef } from "react";
import { Search, X, UserCheck, Phone } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { useTranslation } from "react-i18next";
import { db, type CustomerRecord, type SectionId } from "@/lib/db";

interface Props {
  sectionId: SectionId;
  selectedCustomerId: number | null;
  customerName: string;
  onChangeName: (name: string) => void;
  onSelectCustomer: (c: CustomerRecord) => void;
  onUnlink: () => void;
  error?: string;
}

/**
 * بحث/استدعاء زبون من ملفات الزبائن داخل أي نموذج فاتورة
 * - يبحث بالاسم أو الهاتف فور الكتابة
 * - يعرض النتائج في قائمة منسدلة
 * - عند الاختيار يربط الزبون بـ id ويُملأ كل الحقول من الأم (المكوّن الأب)
 */
export function CustomerAutocomplete({
  sectionId,
  selectedCustomerId,
  customerName,
  onChangeName,
  onSelectCustomer,
  onUnlink,
  error,
}: Props) {
  const { t } = useTranslation();
  const [query, setQuery] = useState(customerName);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // مزامنة الاسم القادم من الأب (مثلاً عند إفراغ النموذج)
  useEffect(() => {
    setQuery(customerName);
  }, [customerName]);

  // إغلاق القائمة عند النقر خارجها
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const customers = useLiveQuery(
    () => db.customers.where("section").equals(sectionId).toArray(),
    [sectionId],
  );

  const results = useMemo(() => {
    if (!customers) return [];
    const q = query.trim().toLowerCase();
    if (!q) return customers.slice(0, 8);
    return customers
      .filter((c) => c.name.toLowerCase().includes(q) || c.phone.includes(q))
      .slice(0, 8);
  }, [customers, query]);

  if (selectedCustomerId !== null) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-xl bg-success/10 border-2 border-success/40">
        <UserCheck className="h-5 w-5 text-success shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm truncate">{customerName}</div>
          <div className="text-xs text-muted-foreground">
            {t("invoices.customer_linked")}
          </div>
        </div>
        <button
          type="button"
          onClick={onUnlink}
          className="p-2 rounded-lg hover:bg-destructive/20 text-destructive transition-colors cursor-pointer"
          title={t("invoices.unlink_customer")}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            onChangeName(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={t("invoices.search_customer_placeholder")}
          className={`w-full h-12 ps-10 pe-3 rounded-xl bg-input border outline-none transition-colors text-base md:text-sm ${
            error ? "border-destructive ring-1 ring-destructive/40" : "border-border focus:border-primary"
          }`}
        />
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-30 top-full left-0 right-0 mt-1 glass-card rounded-xl max-h-64 overflow-y-auto border border-primary/30 shadow-xl">
          {results.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                onSelectCustomer(c);
                setQuery(c.name);
                setOpen(false);
              }}
              className="w-full flex items-center gap-3 p-3 hover:bg-primary/15 text-start border-b border-border/30 last:border-0 cursor-pointer transition-colors"
            >
              <UserCheck className="h-4 w-4 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm truncate">{c.name}</div>
                {c.phone && (
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    {c.phone}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
