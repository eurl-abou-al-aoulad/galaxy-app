/**
 * Server Functions للمزامنة مع Supabase خارجي
 * - رفع بيانات المحل (المنتجات، الفواتير، إلخ) من البرنامج المكتبي
 * - تحقق من بيانات الدخول (كود التفعيل + كود المتحكم) من تطبيق الهاتف
 * - جلب بيانات المحل لعرضها على الهاتف
 * - تطبيق تعديلات من الهاتف على السحابة
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getExternalSupabase, SYNC_TABLE, SHOP_INFO_TABLE } from "./external-sync.server";

const DataTypeSchema = z.enum([
  "products",
  "invoices",
  "debts",
  "expenses",
  "customers",
  "suppliers",
  "workers",
]);

// ============== رفع البيانات من البرنامج المكتبي ==============

export const pushBatchToExternal = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      licenseCode: z.string().min(3).max(64),
      controlCode: z.string().min(3).max(64),
      shopName: z.string().max(120).optional(),
      shopAddress: z.string().max(240).optional(),
      shopPhone: z.string().max(40).optional(),
      ownerName: z.string().max(120).optional(),
      deviceId: z.string().max(120),
      items: z
        .array(
          z.object({
            dataType: DataTypeSchema,
            payload: z.unknown(),
          })
        )
        .min(1)
        .max(2000),
    }).parse
  )
  .handler(async ({ data }) => {
    const sb = getExternalSupabase();

    // upsert shop info
    const { error: shopErr } = await sb.from(SHOP_INFO_TABLE).upsert(
      {
        license_code: data.licenseCode,
        control_code: data.controlCode,
        shop_name: data.shopName ?? null,
        shop_address: data.shopAddress ?? null,
        shop_phone: data.shopPhone ?? null,
        owner_name: data.ownerName ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "license_code" }
    );
    if (shopErr) throw new Error(`shop_info: ${shopErr.message}`);

    // delete previous batch for this license to keep it as snapshot
    const types = Array.from(new Set(data.items.map((i) => i.dataType)));
    const { error: delErr } = await sb
      .from(SYNC_TABLE)
      .delete()
      .eq("license_code", data.licenseCode)
      .in("data_type", types);
    if (delErr) throw new Error(`delete: ${delErr.message}`);

    // insert new snapshot
    const rows = data.items.map((it) => ({
      license_code: data.licenseCode,
      control_code: data.controlCode,
      shop_name: data.shopName ?? null,
      data_type: it.dataType,
      payload: it.payload as object,
      device_id: data.deviceId,
      client_updated_at: new Date().toISOString(),
    }));

    // batch insert in chunks of 500
    const chunkSize = 500;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const { error } = await sb.from(SYNC_TABLE).insert(chunk);
      if (error) throw new Error(`insert: ${error.message}`);
    }

    return { ok: true, count: rows.length, types };
  });

// ============== تحقق من دخول الهاتف ==============

export const verifyMobileLogin = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      licenseCode: z.string().min(3).max(64),
      controlCode: z.string().min(3).max(64),
    }).parse
  )
  .handler(async ({ data }) => {
    const sb = getExternalSupabase();

    const { data: shop, error } = await sb
      .from(SHOP_INFO_TABLE)
      .select("license_code, control_code, shop_name, shop_address, shop_phone, owner_name, updated_at")
      .eq("license_code", data.licenseCode)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!shop) {
      return { ok: false as const, reason: "license_not_found" };
    }
    if (shop.control_code !== data.controlCode) {
      return { ok: false as const, reason: "wrong_control_code" };
    }

    return {
      ok: true as const,
      shop: {
        shopName: shop.shop_name,
        shopAddress: shop.shop_address,
        shopPhone: shop.shop_phone,
        ownerName: shop.owner_name,
        lastUpdate: shop.updated_at,
      },
    };
  });

// ============== جلب بيانات الهاتف ==============

export const fetchMobileData = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      licenseCode: z.string().min(3).max(64),
      controlCode: z.string().min(3).max(64),
      dataTypes: z.array(DataTypeSchema).min(1),
    }).parse
  )
  .handler(async ({ data }) => {
    const sb = getExternalSupabase();

    // verify creds first
    const { data: shop } = await sb
      .from(SHOP_INFO_TABLE)
      .select("control_code")
      .eq("license_code", data.licenseCode)
      .maybeSingle();
    if (!shop || shop.control_code !== data.controlCode) {
      throw new Error("بيانات الدخول غير صحيحة");
    }

    const { data: rows, error } = await sb
      .from(SYNC_TABLE)
      .select("data_type, payload, updated_at")
      .eq("license_code", data.licenseCode)
      .in("data_type", data.dataTypes)
      .order("updated_at", { ascending: false });

    if (error) throw new Error(error.message);

    // group by data_type
    const grouped: Record<string, any[]> = {};
    for (const t of data.dataTypes) grouped[t] = [];
    for (const r of rows ?? []) {
      const t = r.data_type as string;
      if (!grouped[t]) grouped[t] = [];
      grouped[t].push(r.payload);
    }
    return { ok: true as const, data: grouped, fetchedAt: Date.now() };
  });

// ============== تعديل/إضافة عنصر من الهاتف ==============

export const upsertMobileItem = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      licenseCode: z.string().min(3).max(64),
      controlCode: z.string().min(3).max(64),
      dataType: DataTypeSchema,
      payload: z.unknown(),
      deviceId: z.string().max(120).default("mobile"),
    }).parse
  )
  .handler(async ({ data }) => {
    const sb = getExternalSupabase();

    const { data: shop } = await sb
      .from(SHOP_INFO_TABLE)
      .select("control_code")
      .eq("license_code", data.licenseCode)
      .maybeSingle();
    if (!shop || shop.control_code !== data.controlCode) {
      throw new Error("بيانات الدخول غير صحيحة");
    }

    const { error } = await sb.from(SYNC_TABLE).insert({
      license_code: data.licenseCode,
      control_code: data.controlCode,
      data_type: data.dataType,
      payload: data.payload as object,
      device_id: data.deviceId,
      client_updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);

    return { ok: true };
  });
