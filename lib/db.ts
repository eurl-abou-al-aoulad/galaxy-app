/**
 * GalaxyDB — قاعدة البيانات المحلية الموحدة
 * تستخدم Dexie (IndexedDB) — تعمل offline في المتصفح وفي Electron
 */
import Dexie, { type EntityTable } from "dexie";

export type SectionId =
  | "clothing"
  | "supermarket"
  | "hardware"
  | "repair"
  | "factory";

export const ALL_SECTIONS: SectionId[] = [
  "clothing",
  "supermarket",
  "hardware",
  "repair",
  "factory",
];

// ============== الأنواع ==============

export interface ActivationRecord {
  id: number;
  activated: 0 | 1;
  activationCode: string | null;
  trialStartedAt: number;
  activatedAt: number | null;
  /** سبب القفل النهائي إن وُجد — يبقى محفوظاً لمنع الالتفاف عند فقد الإنترنت */
  lockReason?: "revoked" | "expired" | "invalid_code" | null;
}

export interface SettingsRecord {
  id: number;
  companyName: string;
  companyLogo: string | null; // base64
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  rc: string;
  nif: string;
  nic: string;
  ai: string;
  tvaRate: number;
  tvaEnabled: 0 | 1;
  stampEnabled: 0 | 1;
  language: "ar" | "en" | "fr";
  theme: "dark" | "light";
  capital: number;
  adminPassword: string;
  aiHelperEnabled: 0 | 1;
  /** التنبيهات الاستباقية التلقائية أثناء العمل (Toasts) — افتراضي مفعّل */
  aiProactiveEnabled?: 0 | 1;
  // — مزامنة محلية مشفّرة (USB/مجلد شبكة) — المرحلة 4
  cloudSyncEnabled?: 0 | 1;
  /** مسار وصفي للمجلد الذي اختاره المستخدم (مجرد عرض) */
  cloudSyncFolderName?: string | null;
  /** اسم الملف الأخير المستعمل (rotation prefix) */
  cloudSyncFilePrefix?: string;
  /** آخر مزامنة ناجحة */
  cloudSyncLastAt?: number | null;
  /** عدد النسخ المحفوظة (rotation) — افتراضي 7 */
  cloudSyncKeepCount?: number;
  /** فاصل المزامنة الدورية بالدقائق — افتراضي 60 */
  cloudSyncIntervalMin?: number;
  // — تفضيلات الأجهزة المتصلة (اختيارية، تُهيّأ عند أول استخدام)
  devicesEnabled?: 0 | 1;
  defaultPrinter?: string | null;
  defaultThermalPrinter?: string | null;
  defaultScanner?: string | null;
  // — تفضيلات الزكاة الشرعية
  zakatYearStartDate?: number | null;
  goldGramPrice?: number;
  silverGramPrice?: number;
  cashOnHand?: number;
  bankBalance?: number;
  goldGrams?: number;
  silverGrams?: number;
  // — العملة المعروضة في الفواتير والتقارير (افتراضي DZD)
  currency?: string;
}

export interface WorkerRecord {
  id?: number;
  section: SectionId;
  name: string;
  code: string;
  permissions: string[];
  active: 0 | 1;
  createdAt: number;
}

export interface ProductRecord {
  id?: number;
  section: SectionId;
  barcode: string;
  name: string;
  category: string;
  unit: string;
  size?: string;
  color?: string;
  brand?: string;
  deviceType?: string;
  deviceCode?: string;
  purchasePrice: number;
  sellingPrice: number;
  quantity: number;
  minStock: number;
  imageUrl?: string;
  notes?: string;
  createdAt: number;
  updatedAt: number;
  /** تاريخ انتهاء الصلاحية (اختياري) — milliseconds */
  expiryDate?: number | null;
}

export type InvoiceType = "facture" | "bon_livraison" | "bon_commande" | "ticket";
export type InvoiceStatus = "paid" | "partial" | "debt" | "suspended" | "returned";

export interface InvoiceItem {
  productId: number;
  barcode: string;
  name: string;
  unit: string;
  quantity: number;
  purchasePrice: number;
  sellingPrice: number;
  discount: number;
  total: number;
}

export interface ReturnLogEntry {
  date: number;
  reason: string;
  items: { productId: number; name: string; qtyReturned: number; refundAmount: number }[];
  refundTotal: number;
}

export interface InvoiceRecord {
  id?: number;
  section: SectionId;
  invoiceNumber: string;
  type: InvoiceType;
  customerId: number | null;
  customerName: string;
  customerPhone: string;
  customerKind?: "individual" | "company";
  customerRc?: string;
  customerNif?: string;
  customerNic?: string;
  customerAi?: string;
  items: InvoiceItem[];
  originalItems?: InvoiceItem[];
  subtotal: number;
  discount: number;
  tva: number;
  stamp: number;
  shipping: number;
  labor: number;
  total: number;
  paid: number;
  remaining: number;
  status: InvoiceStatus;
  paymentMethod: string;
  notes: string;
  printSize: "thermal" | "a4";
  createdAt: number;
  updatedAt: number;
  createdBy: string;
  editedAt?: number;
  editCount?: number;
  returnLog?: ReturnLogEntry[];
}

export interface DebtRecord {
  id?: number;
  section: SectionId;
  invoiceId: number;
  customerId: number | null;
  customerName: string;
  customerPhone: string;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  payments: { date: number; amount: number; note: string }[];
  status: "active" | "paid";
  createdAt: number;
  updatedAt: number;
}

export interface CustomerRecord {
  id?: number;
  section: SectionId;
  name: string;
  phone: string;
  address: string;
  rc?: string;
  nif?: string;
  nic?: string;
  ai?: string;
  totalPurchases: number;
  totalDebt: number;
  totalReturns: number;
  notes: string;
  createdAt: number;
}

export type ExpenseCategory =
  | "suppliers"
  | "rent"
  | "utilities"
  | "equipment"
  | "workers"
  | "taxes"
  | "repairs"
  | "other";

export interface ExpenseRecord {
  id?: number;
  section: SectionId;
  category: ExpenseCategory;
  description: string;
  amount: number;
  paid: 0 | 1;
  date: number;
  notes: string;
}

export interface SupplierRecord {
  id?: number;
  section: SectionId;
  name: string;
  phone: string;
  email: string;
  address: string;
  category: string;
  notes: string;
  createdAt: number;
}

export interface InvoiceCounterRecord {
  section: SectionId;
  type: InvoiceType;
  lastNumber: number;
}

export type RepairStatus = "waiting" | "working" | "parts" | "ready" | "delivered";
export interface RepairDeviceRecord {
  id?: number;
  section: SectionId;
  ticketNumber: string;
  customerId: number | null;
  customerName: string;
  customerPhone: string;
  deviceType: string;
  brand: string;
  model: string;
  imei: string;
  secretCode: string;
  problemDescription: string;
  diagnosisNotes: string;
  estimatedCost: number;
  finalCost: number;
  status: RepairStatus;
  receivedAt: number;
  completedAt: number | null;
  deliveredAt: number | null;
  invoiceId: number | null;
}

export type TaskStatus = "pending" | "in_progress" | "completed";
export interface TaskRecord {
  id?: number;
  section: SectionId;
  title: string;
  description: string;
  customerId: number | null;
  customerName: string;
  assignedTo: string;
  dueDate: number;
  completedAt: number | null;
  status: TaskStatus;
  priority: "low" | "medium" | "high";
  createdAt: number;
}

export interface AuditLogRecord {
  id?: number;
  section: SectionId;
  action: string; // create_invoice, edit_product, delete_debt, etc
  module: string;
  user: string;
  details: string;
  createdAt: number;
}

// ============== تعريف القاعدة ==============

class GalaxyDatabase extends Dexie {
  activation!: EntityTable<ActivationRecord, "id">;
  settings!: EntityTable<SettingsRecord, "id">;
  workers!: EntityTable<WorkerRecord, "id">;
  products!: EntityTable<ProductRecord, "id">;
  invoices!: EntityTable<InvoiceRecord, "id">;
  debts!: EntityTable<DebtRecord, "id">;
  customers!: EntityTable<CustomerRecord, "id">;
  expenses!: EntityTable<ExpenseRecord, "id">;
  suppliers!: EntityTable<SupplierRecord, "id">;
  invoiceCounters!: Dexie.Table<InvoiceCounterRecord, [SectionId, InvoiceType]>;
  repairDevices!: EntityTable<RepairDeviceRecord, "id">;
  tasks!: EntityTable<TaskRecord, "id">;
  auditLog!: EntityTable<AuditLogRecord, "id">;

  constructor() {
    super("GalaxyAccountingDB");
    this.version(2).stores({
      activation: "id",
      settings: "id",
      workers: "++id, section, code, [section+code]",
      products:
        "++id, section, barcode, name, [section+barcode], [section+name]",
      invoices:
        "++id, section, invoiceNumber, status, customerId, createdAt, [section+status], [section+createdAt]",
      debts:
        "++id, section, invoiceId, customerId, status, [section+status]",
      customers: "++id, section, name, phone, [section+name], [section+phone]",
      expenses: "++id, section, category, date, [section+date]",
      suppliers: "++id, section, name, phone, [section+name]",
      invoiceCounters: "[section+type]",
      repairDevices:
        "++id, section, ticketNumber, status, imei, [section+status]",
      tasks: "++id, section, status, dueDate, [section+status]",
      auditLog: "++id, section, module, createdAt, [section+createdAt]",
    });
    // الإصدار 3: نفس المخطط — حقول التعديل/الإرجاع اختيارية ولا تتطلب فهرساً جديداً
    this.version(3).stores({
      activation: "id",
      settings: "id",
      workers: "++id, section, code, [section+code]",
      products:
        "++id, section, barcode, name, [section+barcode], [section+name]",
      invoices:
        "++id, section, invoiceNumber, status, customerId, createdAt, editedAt, [section+status], [section+createdAt]",
      debts:
        "++id, section, invoiceId, customerId, status, [section+status]",
      customers: "++id, section, name, phone, [section+name], [section+phone]",
      expenses: "++id, section, category, date, [section+date]",
      suppliers: "++id, section, name, phone, [section+name]",
      invoiceCounters: "[section+type]",
      repairDevices:
        "++id, section, ticketNumber, status, imei, [section+status]",
      tasks: "++id, section, status, dueDate, [section+status]",
      auditLog: "++id, section, module, createdAt, [section+createdAt]",
    });
    // الإصدار 4: إضافة فهرس expiryDate للمنتجات (تنبيهات الصلاحية)
    this.version(4).stores({
      activation: "id",
      settings: "id",
      workers: "++id, section, code, [section+code]",
      products:
        "++id, section, barcode, name, expiryDate, [section+barcode], [section+name], [section+expiryDate]",
      invoices:
        "++id, section, invoiceNumber, status, customerId, createdAt, editedAt, [section+status], [section+createdAt]",
      debts:
        "++id, section, invoiceId, customerId, status, [section+status]",
      customers: "++id, section, name, phone, [section+name], [section+phone]",
      expenses: "++id, section, category, date, [section+date]",
      suppliers: "++id, section, name, phone, [section+name]",
      invoiceCounters: "[section+type]",
      repairDevices:
        "++id, section, ticketNumber, status, imei, [section+status]",
      tasks: "++id, section, status, dueDate, [section+status]",
      auditLog: "++id, section, module, createdAt, [section+createdAt]",
    });
  }
}

export const db = new GalaxyDatabase();

// ============== تهيئة افتراضية ==============

export async function initializeDb() {
  const act = await db.activation.get(1);
  if (!act) {
    await db.activation.put({
      id: 1,
      activated: 0,
      activationCode: null,
      trialStartedAt: Date.now(),
      activatedAt: null,
    });
  }

  const settings = await db.settings.get(1);
  if (!settings) {
    await db.settings.put({
      id: 1,
      companyName: "THE GALAXY",
      companyLogo: null,
      companyAddress: "",
      companyPhone: "",
      companyEmail: "",
      rc: "",
      nif: "",
      nic: "",
      ai: "",
      tvaRate: 19,
      tvaEnabled: 1,
      stampEnabled: 1,
      language: "ar",
      theme: "dark",
      capital: 0,
      adminPassword: "admin",
      aiHelperEnabled: 1,
      aiProactiveEnabled: 1,
      currency: "DZD",
    });
  } else {
    const patch: Partial<SettingsRecord> = {};
    if (settings.aiHelperEnabled === undefined) patch.aiHelperEnabled = 1;
    if (settings.aiProactiveEnabled === undefined) patch.aiProactiveEnabled = 1;
    if (settings.tvaEnabled === undefined) patch.tvaEnabled = 1;
    if (settings.stampEnabled === undefined) patch.stampEnabled = 1;
    if (settings.cloudSyncEnabled === undefined) patch.cloudSyncEnabled = 0;
    if (settings.cloudSyncKeepCount === undefined) patch.cloudSyncKeepCount = 7;
    if (settings.cloudSyncIntervalMin === undefined) patch.cloudSyncIntervalMin = 60;
    if (settings.cloudSyncFilePrefix === undefined) patch.cloudSyncFilePrefix = "galaxy-backup";
    if (settings.currency === undefined) patch.currency = "DZD";
    if (Object.keys(patch).length > 0) await db.settings.update(1, patch);
  }

  const types: InvoiceType[] = ["facture", "bon_livraison", "bon_commande", "ticket"];
  for (const section of ALL_SECTIONS) {
    for (const type of types) {
      const c = await db.invoiceCounters.get([section, type]);
      if (!c) {
        await db.invoiceCounters.put({ section, type, lastNumber: 0 });
      }
    }
  }
}

// ============== الوظائف المساعدة ==============

export async function addOrUpdateProductStock(params: {
  section: SectionId;
  barcode: string;
  defaults: Omit<ProductRecord, "id" | "createdAt" | "updatedAt">;
  addQuantity: number;
  newPurchasePrice: number;
  newSellingPrice: number;
}): Promise<ProductRecord> {
  const existing = await db.products
    .where("[section+barcode]")
    .equals([params.section, params.barcode])
    .first();

  const now = Date.now();
  if (existing) {
    const purchasePrice = Math.max(existing.purchasePrice, params.newPurchasePrice);
    const sellingPrice = Math.max(existing.sellingPrice, params.newSellingPrice);
    const quantity = existing.quantity + params.addQuantity;
    await db.products.update(existing.id!, {
      purchasePrice,
      sellingPrice,
      quantity,
      updatedAt: now,
    });
    return { ...existing, purchasePrice, sellingPrice, quantity, updatedAt: now };
  } else {
    const id = await db.products.add({
      ...params.defaults,
      quantity: params.addQuantity,
      purchasePrice: params.newPurchasePrice,
      sellingPrice: params.newSellingPrice,
      createdAt: now,
      updatedAt: now,
    } as ProductRecord);
    return { ...(params.defaults as ProductRecord), id, createdAt: now, updatedAt: now };
  }
}

export async function nextInvoiceNumber(
  section: SectionId,
  type: InvoiceType,
): Promise<string> {
  return await db.transaction("rw", db.invoiceCounters, async () => {
    const c = (await db.invoiceCounters.get([section, type])) ?? {
      section,
      type,
      lastNumber: 0,
    };
    c.lastNumber += 1;
    await db.invoiceCounters.put(c);

    const prefix: Record<InvoiceType, string> = {
      facture: "FAC",
      bon_livraison: "BL",
      bon_commande: "BC",
      ticket: "TKT",
    };
    const sectionPrefix: Record<SectionId, string> = {
      clothing: "CL",
      supermarket: "SM",
      hardware: "HW",
      repair: "RP",
      factory: "FC",
    };
    const year = new Date().getFullYear();
    const num = c.lastNumber.toString().padStart(5, "0");
    return `${prefix[type]}-${sectionPrefix[section]}-${year}-${num}`;
  });
}

export async function nextRepairTicket(section: SectionId): Promise<string> {
  const count = await db.repairDevices.where("section").equals(section).count();
  const year = new Date().getFullYear();
  return `RPR-${year}-${(count + 1).toString().padStart(5, "0")}`;
}

export async function logAudit(record: Omit<AuditLogRecord, "id" | "createdAt">) {
  await db.auditLog.add({ ...record, createdAt: Date.now() });
}

export async function exportAllData(): Promise<string> {
  const data = {
    version: 2,
    exportedAt: Date.now(),
    settings: await db.settings.toArray(),
    workers: await db.workers.toArray(),
    products: await db.products.toArray(),
    invoices: await db.invoices.toArray(),
    debts: await db.debts.toArray(),
    customers: await db.customers.toArray(),
    expenses: await db.expenses.toArray(),
    suppliers: await db.suppliers.toArray(),
    invoiceCounters: await db.invoiceCounters.toArray(),
    repairDevices: await db.repairDevices.toArray(),
    tasks: await db.tasks.toArray(),
    auditLog: await db.auditLog.toArray(),
  };
  return JSON.stringify(data, null, 2);
}

export async function importAllData(json: string) {
  const data = JSON.parse(json);
  await db.transaction(
    "rw",
    [db.settings, db.workers, db.products, db.invoices, db.debts, db.customers, db.expenses, db.suppliers, db.invoiceCounters, db.repairDevices, db.tasks, db.auditLog],
    async () => {
      if (data.settings) {
        await db.settings.clear();
        await db.settings.bulkAdd(data.settings);
      }
      if (data.workers) { await db.workers.clear(); await db.workers.bulkAdd(data.workers); }
      if (data.products) { await db.products.clear(); await db.products.bulkAdd(data.products); }
      if (data.invoices) { await db.invoices.clear(); await db.invoices.bulkAdd(data.invoices); }
      if (data.debts) { await db.debts.clear(); await db.debts.bulkAdd(data.debts); }
      if (data.customers) { await db.customers.clear(); await db.customers.bulkAdd(data.customers); }
      if (data.expenses) { await db.expenses.clear(); await db.expenses.bulkAdd(data.expenses); }
      if (data.suppliers) { await db.suppliers.clear(); await db.suppliers.bulkAdd(data.suppliers); }
      if (data.invoiceCounters) { await db.invoiceCounters.clear(); await db.invoiceCounters.bulkAdd(data.invoiceCounters); }
      if (data.repairDevices) { await db.repairDevices.clear(); await db.repairDevices.bulkAdd(data.repairDevices); }
      if (data.tasks) { await db.tasks.clear(); await db.tasks.bulkAdd(data.tasks); }
      if (data.auditLog) { await db.auditLog.clear(); await db.auditLog.bulkAdd(data.auditLog); }
    }
  );
}
