"use client";

import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ConfirmDialog({
  open, title, message, confirmLabel = "Yes, continue", onConfirm, onCancel, busy,
  destructive = false, busyLabel = "Working…",
}: {
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
  destructive?: boolean;
  busyLabel?: string;
}) {
  const accentBorder = destructive ? "rgba(239,68,68,0.35)" : "rgba(255,77,0,0.3)";
  const iconBg       = destructive ? "rgba(239,68,68,0.15)" : "rgba(255,77,0,0.15)";
  const iconColor    = destructive ? "#f87171" : "#FF7A35";
  const confirmBg    = destructive
    ? "linear-gradient(135deg, #dc2626, #ef4444)"
    : "linear-gradient(135deg, #FF4D00, #FF7A35)";
  const Icon = destructive ? Trash2 : AlertTriangle;
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(2px)" }}
          onClick={busy ? undefined : onCancel}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.18 }}
            onClick={e => e.stopPropagation()}
            className="w-full max-w-[400px] rounded-2xl overflow-hidden"
            style={{ background: "#181818", border: `1px solid ${accentBorder}`, boxShadow: "0 20px 60px rgba(0,0,0,0.6)" }}
          >
            <div className="px-4 sm:px-6 pt-6 pb-4 flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: iconBg }}>
                <Icon size={18} style={{ color: iconColor }} />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-[#F5F5F5]">{title}</h3>
                <div className="text-[13px] text-[#aaaaaa] mt-1.5 leading-relaxed">{message}</div>
              </div>
            </div>
            <div className="flex gap-2 px-4 sm:px-6 pb-6">
              <Button
                onClick={onCancel}
                disabled={busy}
                className="flex-1 h-9 text-sm font-medium"
                style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.15)", color: "#aaaaaa" }}
              >
                Cancel
              </Button>
              <Button
                onClick={onConfirm}
                disabled={busy}
                className="flex-1 h-9 text-sm font-semibold text-white gap-2"
                style={{ background: confirmBg, border: "none" }}
              >
                {busy ? <><Loader2 size={14} className="animate-spin" /> {busyLabel}</> : confirmLabel}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
