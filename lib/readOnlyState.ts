/**
 * مخزن بسيط يعكس حالة "للقراءة فقط" عبر التطبيق.
 * يُحدَّث من LicenseGuard، ويُقرأ من AppContext وأي مكون يحتاجه.
 */
type Listener = (v: boolean) => void;

let _readOnly = false;
let _reason: "expired" | "revoked" | "invalid_code" | null = null;
const listeners = new Set<Listener>();

export function setReadOnly(v: boolean, reason: typeof _reason = null) {
  _readOnly = v;
  _reason = v ? reason : null;
  listeners.forEach((l) => l(v));
}

export function isReadOnly(): boolean {
  return _readOnly;
}

export function getReadOnlyReason() {
  return _reason;
}

export function subscribeReadOnly(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
