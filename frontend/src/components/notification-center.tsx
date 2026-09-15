"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell, BellDot, BellOff, CheckCheck, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  activatePushNotifications, browserSupportsPush, fetchNotifications, fetchNotificationsSummary,
  fetchPushConfig, fetchPushStatus, markAllNotificationsAsRead, markNotificationAsRead,
  type NotificationItem, type NotificationsSummaryResponse, type PushConfigResponse, type PushStatusResponse,
} from "@/lib/push-notifications";
import { cn } from "@/lib/cn";
import { useTenant } from "./TenantProvider";
import { useUpdatesRealtime } from "@/lib/realtime/useUpdatesRealtime";

type TabType = "unread" | "read";

function date(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(parsed);
}

export function NotificationCenter() {
  const router = useRouter();
  const { href } = useTenant();
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("unread");
  const [unreadItems, setUnreadItems] = useState<NotificationItem[]>([]);
  const [readItems, setReadItems] = useState<NotificationItem[]>([]);
  const [unreadOffset, setUnreadOffset] = useState(0);
  const [readOffset, setReadOffset] = useState(0);
  const [summary, setSummary] = useState<NotificationsSummaryResponse>({ total: 0, unread: 0 });
  const [config, setConfig] = useState<PushConfigResponse | null>(null);
  const [status, setStatus] = useState<PushStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activating, startActivating] = useTransition();
  const [marking, startMarking] = useTransition();

  const pageSize = 20;
  const unreadHasMore = unreadItems.length >= pageSize;
  const readHasMore = readItems.length >= pageSize;

  async function refreshBadge() {
    try {
      const [nextSummary, nextStatus] = await Promise.all([fetchNotificationsSummary(), fetchPushStatus()]);
      setSummary(nextSummary); setStatus(nextStatus);
      setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível carregar notificações."); }
  }

  async function loadTabData(tab: TabType, offset: number) {
    setLoading(true);
    try {
      const list = await fetchNotifications(tab, offset);
      if (tab === "unread") setUnreadItems(list.items);
      else setReadItems(list.items);
      setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível carregar notificações."); }
    finally { setLoading(false); }
  }

  async function refreshPanel() {
    setLoading(true);
    try {
      const [nextSummary, nextStatus, unreadList, readList] = await Promise.all([
        fetchNotificationsSummary(),
        fetchPushStatus(),
        fetchNotifications("unread", 0),
        fetchNotifications("read", 0),
      ]);
      setSummary(nextSummary); setStatus(nextStatus);
      setUnreadItems(unreadList.items);
      setReadItems(readList.items);
      setUnreadOffset(0);
      setReadOffset(0);
      setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível carregar notificações."); }
    finally { setLoading(false); }
  }

  function handleTabChange(tab: TabType) {
    setActiveTab(tab);
    const currentOffset = tab === "unread" ? unreadOffset : readOffset;
    if (currentOffset === 0 && (tab === "unread" ? unreadItems.length === 0 : readItems.length === 0)) {
      void loadTabData(tab, 0);
    }
  }

  function handlePrevPage() {
    const newOffset = Math.max(0, (activeTab === "unread" ? unreadOffset : readOffset) - pageSize);
    if (activeTab === "unread") setUnreadOffset(newOffset);
    else setReadOffset(newOffset);
    void loadTabData(activeTab, newOffset);
  }

  function handleNextPage() {
    const newOffset = (activeTab === "unread" ? unreadOffset : readOffset) + pageSize;
    if (activeTab === "unread") setUnreadOffset(newOffset);
    else setReadOffset(newOffset);
    void loadTabData(activeTab, newOffset);
  }

  useEffect(() => {
    const initialRefresh = window.setTimeout(() => void refreshBadge(), 0);
    fetchPushConfig().then(setConfig).catch(() => {});
    return () => window.clearTimeout(initialRefresh);
  }, []);

  useEffect(() => {
    if (!open) return;
    const refreshTimer = window.setTimeout(() => void refreshPanel(), 0);
    return () => window.clearTimeout(refreshTimer);
  }, [open]);

  useUpdatesRealtime(
    (update) => {
      if (update === "notifications_updated") void (open ? refreshPanel() : refreshBadge());
    },
    { onResync: () => void refreshBadge() },
  );

  const canActivate = browserSupportsPush() && config?.enabled && config?.configured && !status?.active && (typeof Notification === "undefined" || Notification.permission !== "denied");
  async function openItem(item: NotificationItem) {
    try {
      if (!item.read) await markNotificationAsRead(item.id);
      if (activeTab === "unread") {
        setUnreadItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, read: true } : entry));
      } else {
        setReadItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, read: true } : entry));
      }
      void refreshBadge(); setOpen(false); router.push(href(item.url || "/"));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível abrir a notificação."); }
  }

  const currentItems = activeTab === "unread" ? unreadItems : readItems;
  const currentHasMore = activeTab === "unread" ? unreadHasMore : readHasMore;
  const currentOffset = activeTab === "unread" ? unreadOffset : readOffset;

  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><Button variant="ghost" size="md" className="relative min-h-0 rounded-full px-3" aria-label="Abrir notificações">
      {status?.active ? <BellDot className="size-5" /> : <Bell className="size-5" />}
      {summary.unread > 0 && <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-[var(--brand)] px-1 text-[10px]">{summary.unread > 99 ? "99+" : summary.unread}</span>}
    </Button></DialogTrigger>
    <DialogContent className="flex max-h-[88vh] flex-col p-0 sm:max-w-2xl">
      <div className="border-b px-6 py-5"><DialogHeader><div><DialogTitle>Notificações</DialogTitle><DialogDescription>{summary.unread} não lidas de {summary.total} total</DialogDescription></div></DialogHeader></div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 px-6 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-stone-50 p-4">
          <div><p className="font-semibold">{status?.active ? "Push ativo neste dispositivo" : "Push desativado"}</p><p className="text-sm text-stone-600">{status?.active ? "Você receberá alertas mesmo fora desta tela." : "A caixa de entrada continua disponível aqui."}</p></div>
          <div className="flex gap-2">{canActivate ? <Button disabled={activating} onClick={() => startActivating(async () => { try { await activatePushNotifications(); await refreshPanel(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível ativar o Push."); } })}>{activating ? <Loader2 className="size-4 animate-spin" /> : <Bell className="size-4" />} Ativar</Button> : <span className="inline-flex items-center gap-1 rounded-full border px-3 py-2 text-xs">{status?.active ? <BellDot className="size-4" /> : <BellOff className="size-4" />}{status?.active ? "Ativo" : "Inativo"}</span>}<Button variant="outline" disabled={marking || summary.unread === 0} onClick={() => startMarking(async () => { await markAllNotificationsAsRead(); setUnreadItems([]); setReadItems([]); setSummary((current) => ({ ...current, unread: 0 })); })}><CheckCheck className="size-4" /> Limpar todas</Button></div>
        </div>
        {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <div className="flex gap-2 border-b">
          <button onClick={() => handleTabChange("unread")} className={cn("px-3 py-2 font-medium text-sm border-b-2 -mb-px", activeTab === "unread" ? "border-[var(--brand)] text-[var(--brand)]" : "border-transparent text-stone-600 hover:text-stone-900")}>Abertas ({summary.unread})</button>
          <button onClick={() => handleTabChange("read")} className={cn("px-3 py-2 font-medium text-sm border-b-2 -mb-px", activeTab === "read" ? "border-[var(--brand)] text-[var(--brand)]" : "border-transparent text-stone-600 hover:text-stone-900")}>Lidas ({summary.total - summary.unread})</button>
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">{loading ? <p className="p-8 text-center text-sm text-stone-500">Carregando…</p> : currentItems.length ? currentItems.map((item) => <button key={item.id} type="button" onClick={() => void openItem(item)} className={cn("w-full rounded-xl border p-4 text-left", item.read ? "bg-white" : "border-[var(--brand)] bg-[var(--brand)]/10")}><p className="font-semibold">{item.title}</p><p className="mt-1 text-sm text-stone-600">{item.body}</p><p className="mt-2 text-xs text-stone-500">{date(item.created_at)}</p></button>) : <p className="p-8 text-center text-sm text-stone-500">{activeTab === "unread" ? "Nenhuma notificação em aberto." : "Nenhuma notificação lida."}</p>}</div>
        {(currentItems.length > 0 || currentOffset > 0) && <div className="flex justify-between items-center gap-2 border-t pt-4"><Button variant="outline" size="sm" disabled={currentOffset === 0 || loading} onClick={handlePrevPage}><ChevronLeft className="size-4" /> Anterior</Button><span className="text-xs text-stone-600">Página {Math.floor(currentOffset / pageSize) + 1}</span><Button variant="outline" size="sm" disabled={!currentHasMore || loading} onClick={handleNextPage}>Próxima <ChevronRight className="size-4" /></Button></div>}
      </div>
    </DialogContent>
  </Dialog>;
}
