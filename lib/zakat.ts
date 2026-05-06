/**
 * حساب الزكاة وفق الفقه الإسلامي.
 *
 * القواعد:
 *  1. النصاب = قيمة 85 جراماً من الذهب بالسعر الحالي.
 *  2. الحول = مرور سنة هجرية (354 يوماً قمرياً) على بلوغ النصاب.
 *  3. الوعاء الزكوي = نقد + بنك + ذهب (قيمة) + فضة (قيمة)
 *                    + قيمة المخزن بسعر البيع (عروض التجارة)
 *                    + الديون المرجوّة − الديون الواجبة − المصاريف المستحقة.
 *  4. إن بلغ الوعاء النصاب ومرّ الحول ⇒ الزكاة = الوعاء × 2.5%.
 *
 * ملاحظات شرعية:
 *  - الزكاة تُحسب عند تمام الحول لا قبله.
 *  - الديون التي على التاجر تُخصم من الوعاء (إن نوى سدادها قريباً).
 *  - الديون التي للتاجر تُحسب فقط إن كانت مرجوّة (الزبون مليء غير مماطل).
 *  - عروض التجارة تُقيَّم بسعر البيع يوم الحول (وليس سعر الشراء).
 */

export const NISAB_GOLD_GRAMS = 85;
export const ZAKAT_RATE = 0.025; // 2.5%
export const HIJRI_YEAR_DAYS = 354;

export interface ZakatInputs {
  cashOnHand: number;
  bankBalance: number;
  goldGrams: number;
  silverGrams: number;
  goldGramPrice: number;   // سعر جرام الذهب يوم الحساب
  silverGramPrice: number; // سعر جرام الفضة
  inventorySaleValue: number; // قيمة المخزن بسعر البيع
  receivableDebts: number;    // ديون مرجوة (للتاجر على الآخرين)
  payableDebts: number;       // ديون مستحقة عليه
  pendingExpenses: number;    // مصاريف ثابتة مستحقة
  yearStartDate: number | null; // تاريخ بداية الحول (timestamp)
}

export interface ZakatResult {
  nisabValue: number;
  goldValue: number;
  silverValue: number;
  totalAssets: number;
  totalLiabilities: number;
  zakatBase: number;        // الوعاء
  reachesNisab: boolean;
  hawlCompleted: boolean;
  hawlEndDate: number | null;
  daysUntilHawl: number;
  zakatDue: number;
  isObligatory: boolean;
}

export function calculateZakat(input: ZakatInputs): ZakatResult {
  const goldValue = input.goldGrams * input.goldGramPrice;
  const silverValue = input.silverGrams * input.silverGramPrice;
  const totalAssets =
    input.cashOnHand +
    input.bankBalance +
    goldValue +
    silverValue +
    input.inventorySaleValue +
    input.receivableDebts;
  const totalLiabilities = input.payableDebts + input.pendingExpenses;
  const zakatBase = Math.max(0, totalAssets - totalLiabilities);

  const nisabValue = NISAB_GOLD_GRAMS * input.goldGramPrice;
  const reachesNisab = zakatBase >= nisabValue;

  let hawlCompleted = false;
  let hawlEndDate: number | null = null;
  let daysUntilHawl = 0;
  if (input.yearStartDate) {
    hawlEndDate = input.yearStartDate + HIJRI_YEAR_DAYS * 24 * 60 * 60 * 1000;
    const now = Date.now();
    hawlCompleted = now >= hawlEndDate;
    daysUntilHawl = Math.max(0, Math.ceil((hawlEndDate - now) / (24 * 60 * 60 * 1000)));
  }

  const isObligatory = reachesNisab && hawlCompleted;
  const zakatDue = isObligatory ? zakatBase * ZAKAT_RATE : 0;

  return {
    nisabValue,
    goldValue,
    silverValue,
    totalAssets,
    totalLiabilities,
    zakatBase,
    reachesNisab,
    hawlCompleted,
    hawlEndDate,
    daysUntilHawl,
    zakatDue,
    isObligatory,
  };
}
