"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ScrollText,
  RefreshCw,
  Trash2,
  AlertCircle,
  AlertTriangle,
  Info,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

interface Log {
  id: number;
  level: string;
  message: string;
  details: string | null;
  createdAt: string;
}

interface Pagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export default function AdminLogsPage() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchLogs();
  }, [filter, page]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter) params.set("level", filter);
      params.set("page", page.toString());
      params.set("limit", "50");

      const response = await fetch(`/api/admin/logs?${params}`);
      if (response.ok) {
        const data = await response.json();
        setLogs(data.logs);
        setPagination(data.pagination);
      }
    } catch (error) {
      console.error("Error fetching logs:", error);
    } finally {
      setLoading(false);
    }
  };

  const deleteLogs = async (days: number) => {
    if (!confirm(`${days} gunden eski tum loglar silinecek. Emin misiniz?`)) return;

    setDeleting(true);
    try {
      const response = await fetch(`/api/admin/logs?days=${days}`, {
        method: "DELETE",
      });
      if (response.ok) {
        const data = await response.json();
        alert(data.message);
        fetchLogs();
      }
    } catch (error) {
      console.error("Error deleting logs:", error);
    } finally {
      setDeleting(false);
    }
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString("tr-TR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const getLevelIcon = (level: string) => {
    switch (level) {
      case "error":
        return <AlertCircle className="h-4 w-4 text-red-400" />;
      case "warning":
        return <AlertTriangle className="h-4 w-4 text-amber-400" />;
      default:
        return <Info className="h-4 w-4 text-blue-400" />;
    }
  };

  const getLevelBadge = (level: string) => {
    switch (level) {
      case "error":
        return <Badge variant="destructive">Hata</Badge>;
      case "warning":
        return <Badge className="bg-amber-600">Uyari</Badge>;
      default:
        return <Badge className="bg-blue-600">Bilgi</Badge>;
    }
  };

  const filterButtons = [
    { value: null, label: "Tumu" },
    { value: "info", label: "Bilgi" },
    { value: "warning", label: "Uyari" },
    { value: "error", label: "Hata" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Bot Loglari</h1>
          <p className="text-slate-400">Bot aktivitelerini ve hatalari inceleyin</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchLogs()}
            className="border-slate-700 text-slate-300 hover:bg-slate-800"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Yenile
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => deleteLogs(7)}
            disabled={deleting}
            className="border-red-700/50 text-red-400 hover:bg-red-900/30"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Eski Loglari Sil
          </Button>
        </div>
      </div>

      {/* Filtreler */}
      <div className="flex gap-2">
        {filterButtons.map((btn) => (
          <Button
            key={btn.value || "all"}
            variant={filter === btn.value ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setFilter(btn.value);
              setPage(1);
            }}
            className={
              filter === btn.value
                ? "bg-blue-600 hover:bg-blue-700"
                : "border-slate-700 text-slate-400 hover:bg-slate-800"
            }
          >
            {btn.label}
          </Button>
        ))}
      </div>

      {/* İstatistikler */}
      {pagination && (
        <div className="flex items-center gap-4 text-sm text-slate-400">
          <span>Toplam: {pagination.total} log</span>
          <span>Sayfa: {pagination.page} / {pagination.totalPages}</span>
        </div>
      )}

      {/* Log Listesi */}
      <Card className="bg-slate-900/50 border-slate-700/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-100">
            <ScrollText className="h-5 w-5" />
            Log Kayitlari
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-16 bg-slate-800" />
              ))}
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <ScrollText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Henuz log kaydı yok</p>
            </div>
          ) : (
            <div className="space-y-2">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className={`p-4 rounded-lg border ${
                    log.level === "error"
                      ? "bg-red-900/20 border-red-700/30"
                      : log.level === "warning"
                      ? "bg-amber-900/20 border-amber-700/30"
                      : "bg-slate-800/50 border-slate-700/30"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      {getLevelIcon(log.level)}
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          {getLevelBadge(log.level)}
                          <span className="text-xs text-slate-500">
                            {formatDateTime(log.createdAt)}
                          </span>
                        </div>
                        <p className="text-slate-200">{log.message}</p>
                        {log.details && (
                          <p className="text-sm text-slate-400 mt-1 font-mono bg-slate-900/50 p-2 rounded">
                            {log.details}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sayfalama */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(page - 1)}
            disabled={page <= 1}
            className="border-slate-700 text-slate-300"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-slate-400 px-4">
            {page} / {pagination.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(page + 1)}
            disabled={page >= pagination.totalPages}
            className="border-slate-700 text-slate-300"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
