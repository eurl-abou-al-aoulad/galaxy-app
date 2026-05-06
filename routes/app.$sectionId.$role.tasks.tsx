import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { CalendarCheck, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { db, type TaskStatus } from "@/lib/db";
import { useSection } from "@/contexts/AppContext";
import { NeonButton } from "@/components/galaxy/NeonButton";
import { FormModal } from "@/components/galaxy/FormModal";
import { FormField, FieldGrid, TextInput, TextArea, SelectInput } from "@/components/galaxy/FormField";
import { formatDate } from "@/lib/printing";

export const Route = createFileRoute("/app/$sectionId/$role/tasks")({
  component: TasksPage,
});

const STATUS_COLOR: Record<TaskStatus, string> = {
  pending: "bg-warning/20 text-warning border-warning/40",
  in_progress: "bg-accent/20 text-accent border-accent/40",
  completed: "bg-success/20 text-success border-success/40",
};
const PRIORITY_COLOR: Record<string, string> = {
  high: "bg-destructive/20 text-destructive",
  medium: "bg-warning/20 text-warning",
  low: "bg-muted text-muted-foreground",
};

function TasksPage() {
  const { t } = useTranslation();
  const { sectionId } = useSection();
  const tasks = useLiveQuery(() => db.tasks.where("section").equals(sectionId).reverse().sortBy("createdAt"), [sectionId]);
  const [showForm, setShowForm] = useState(false);

  if (!tasks) return null;

  // weekly chart
  const days: { d: string; count: number }[] = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(now.getDate() - i); d.setHours(0, 0, 0, 0);
    const next = new Date(d); next.setDate(d.getDate() + 1);
    const count = tasks.filter((x) => x.dueDate >= d.getTime() && x.dueDate < next.getTime()).length;
    days.push({ d: d.toLocaleDateString("en", { weekday: "short" }), count });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl md:text-3xl font-bold text-gradient-galaxy flex items-center gap-3">
          <CalendarCheck className="h-7 w-7 text-primary" /> {t("tasks.title")}
        </h1>
        <NeonButton variant="primary" onClick={() => setShowForm(true)}><Plus className="h-5 w-5" /> {t("tasks.new_task")}</NeonButton>
      </div>

      <div className="glass-card rounded-2xl p-4">
        <h3 className="text-sm font-bold mb-2">{t("tasks.weekly_chart")}</h3>
        <div className="h-40 w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
            <BarChart data={days}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.5 0.05 280 / 0.2)" />
              <XAxis dataKey="d" stroke="oklch(0.7 0.03 280)" />
              <YAxis stroke="oklch(0.7 0.03 280)" allowDecimals={false} />
              <Tooltip contentStyle={{ background: "oklch(0.18 0.05 280)", border: "1px solid oklch(0.7 0.2 200 / 0.4)", borderRadius: 12 }} />
              <Bar dataKey="count" fill="oklch(0.78 0.18 200)" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase">
              <tr>
                <th className="px-3 py-3 text-start">{t("tasks.task_title")}</th>
                <th className="px-3 py-3 text-start hidden md:table-cell">{t("tasks.assigned_to")}</th>
                <th className="px-3 py-3 text-center">{t("tasks.due_date")}</th>
                <th className="px-3 py-3 text-center">{t("tasks.priority")}</th>
                <th className="px-3 py-3 text-center">{t("repair.status")}</th>
                <th className="px-3 py-3 text-center">{t("actions.delete")}</th>
              </tr>
            </thead>
            <tbody>
              {tasks.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">{t("common.no_data")}</td></tr>
              ) : tasks.map((tk) => (
                <tr key={tk.id} className="border-t border-border/40">
                  <td className="px-3 py-3 font-semibold">{tk.title}<div className="text-xs text-muted-foreground">{tk.description}</div></td>
                  <td className="px-3 py-3 hidden md:table-cell">{tk.assignedTo}</td>
                  <td className="px-3 py-3 text-center text-xs">{formatDate(tk.dueDate)}</td>
                  <td className="px-3 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${PRIORITY_COLOR[tk.priority]}`}>
                      {t(`tasks.${tk.priority}`)}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <select value={tk.status} onChange={async (e) => { await db.tasks.update(tk.id!, { status: e.target.value as TaskStatus }); }} className={`text-xs px-2 py-1 rounded-full border font-semibold ${STATUS_COLOR[tk.status]}`}>
                      {(["pending", "in_progress", "completed"] as TaskStatus[]).map((s) => <option key={s} value={s}>{t(`tasks.${s}`)}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <button onClick={() => {
                      toast(t("common.are_you_sure"), {
                        action: {
                          label: t("actions.delete", { defaultValue: "حذف" }),
                          onClick: async () => { await db.tasks.delete(tk.id!); toast.success(t("common.deleted")); },
                        },
                        duration: 5000,
                      });
                    }} className="text-destructive p-1.5 hover:bg-destructive/20 rounded-lg"><Trash2 className="h-4 w-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && <TaskForm sectionId={sectionId} onClose={() => setShowForm(false)} />}
    </div>
  );
}

function TaskForm({ sectionId, onClose }: { sectionId: ReturnType<typeof useSection>["sectionId"]; onClose: () => void }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({
    title: "", description: "", assignedTo: "",
    dueDate: new Date().toISOString().split("T")[0],
    priority: "medium" as "low" | "medium" | "high",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = async () => {
    const e: Record<string, string> = {};
    if (!form.title.trim()) e.title = t("validation.required");
    if (!form.dueDate) e.dueDate = t("validation.required");
    setErrors(e);
    const errCount = Object.keys(e).length;
    if (errCount > 0) {
      toast.error(errCount === 1 ? t("validation.fields_missing_one") : t("validation.fields_missing_other", { count: errCount }));
      return;
    }
    await db.tasks.add({
      section: sectionId, title: form.title, description: form.description,
      customerId: null, customerName: "", assignedTo: form.assignedTo,
      dueDate: new Date(form.dueDate).getTime(), completedAt: null,
      status: "pending", priority: form.priority, createdAt: Date.now(),
    });
    toast.success(t("common.saved"));
    onClose();
  };

  const update = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => {
    setForm({ ...form, [k]: v });
    if (errors[k as string]) setErrors({ ...errors, [k as string]: "" });
  };

  return (
    <FormModal
      title={t("tasks.new_task")}
      onClose={onClose}
      size="md"
      footer={
        <>
          <NeonButton variant="ghost" onClick={onClose}>{t("actions.cancel")}</NeonButton>
          <NeonButton variant="primary" onClick={save}>{t("actions.save")}</NeonButton>
        </>
      }
    >
      <div className="space-y-4">
        <FormField label={t("tasks.task_title")} required error={errors.title}>
          <TextInput value={form.title} onChange={(e) => update("title", e.target.value)} error={!!errors.title} />
        </FormField>
        <FormField label={t("tasks.description")}>
          <TextArea value={form.description} onChange={(e) => update("description", e.target.value)} />
        </FormField>
        <FieldGrid cols={2}>
          <FormField label={t("tasks.assigned_to")}>
            <TextInput value={form.assignedTo} onChange={(e) => update("assignedTo", e.target.value)} />
          </FormField>
          <FormField label={t("tasks.due_date")} required error={errors.dueDate}>
            <TextInput type="date" value={form.dueDate} onChange={(e) => update("dueDate", e.target.value)} error={!!errors.dueDate} />
          </FormField>
          <FormField label={t("tasks.priority")} className="md:col-span-2">
            <SelectInput value={form.priority} onChange={(e) => update("priority", e.target.value as "low" | "medium" | "high")}>
              <option value="low">{t("tasks.low")}</option>
              <option value="medium">{t("tasks.medium")}</option>
              <option value="high">{t("tasks.high")}</option>
            </SelectInput>
          </FormField>
        </FieldGrid>
      </div>
    </FormModal>
  );
}
