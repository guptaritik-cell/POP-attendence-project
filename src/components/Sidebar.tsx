"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, UsersRound, BarChart3, UserCircle, UserPlus,
  ChevronLeft, ChevronRight, LogOut,
} from "lucide-react";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";

// ── Brand colours (dashboard uses original purple spec) ───────────────────
const PURPLE      = "#7C3AED";
const SURFACE     = "#1A1A24";
const BORDER_CLR  = "rgba(124,58,237,0.15)";
const ACTIVE_BG   = "rgba(124,58,237,0.12)";
const HOVER_BG    = "rgba(255,255,255,0.04)";

const NAV_ITEMS = [
  { label: "All Employees",    href: "/dashboard/all-employees",    Icon: Users },
  { label: "Team View",        href: "/dashboard/team-view",        Icon: UsersRound },
  { label: "Analytics",        href: "/dashboard/analytics",        Icon: BarChart3 },
  { label: "Employee Profile", href: "/dashboard/employee-profile", Icon: UserCircle },
  { label: "Add Member",       href: "/dashboard/add-member",       Icon: UserPlus },
];

function getInitials(name: string) {
  return name.split(" ").slice(0, 2).map(p => p[0]).join("").toUpperCase();
}

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const userName = session?.user?.name ?? "Admin";

  return (
    <motion.aside
      animate={{ width: collapsed ? 64 : 240 }}
      transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
      className="flex-shrink-0 flex flex-col h-screen overflow-hidden"
      style={{ background: SURFACE, borderRight: `1px solid ${BORDER_CLR}` }}
    >
      {/* ── Top: logo + collapse toggle ── */}
      <div
        className="flex items-center h-16 px-3 flex-shrink-0"
        style={{ borderBottom: `1px solid ${BORDER_CLR}` }}
      >
        {/* Logo */}
        <Link href="/dashboard/all-employees" className="flex items-center gap-3 min-w-0">
          <div
            className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-black select-none"
            style={{
              background: "radial-gradient(circle at 35% 35%, #FF7A35 0%, #FF4D00 55%, #CC1F00 100%)",
            }}
          >
            p
          </div>
          <AnimatePresence initial={false}>
            {!collapsed && (
              <motion.span
                key="logo-text"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.15 }}
                className="text-white font-bold text-sm whitespace-nowrap"
              >
                POP Attendance
              </motion.span>
            )}
          </AnimatePresence>
        </Link>

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(c => !c)}
          className="ml-auto flex-shrink-0 w-6 h-6 rounded flex items-center justify-center transition-colors"
          style={{ color: "#8B8A9B" }}
          onMouseEnter={e => (e.currentTarget.style.color = "#F1F0F5")}
          onMouseLeave={e => (e.currentTarget.style.color = "#8B8A9B")}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      {/* ── Nav items ── */}
      <nav className="flex-1 py-3 overflow-hidden">
        {NAV_ITEMS.map(({ label, href, Icon }) => {
          const isActive = pathname.startsWith(href);
          const item = (
            <Link
              key={href}
              href={href}
              className="relative flex items-center gap-3 mx-2 my-0.5 rounded-lg transition-colors"
              style={{
                padding: collapsed ? "10px 0" : "10px 12px",
                justifyContent: collapsed ? "center" : "flex-start",
                background: isActive ? ACTIVE_BG : "transparent",
                color: isActive ? "#F1F0F5" : "#8B8A9B",
              }}
              onMouseEnter={e => {
                if (!isActive) (e.currentTarget as HTMLElement).style.background = HOVER_BG;
              }}
              onMouseLeave={e => {
                if (!isActive) (e.currentTarget as HTMLElement).style.background = "transparent";
              }}
            >
              {/* Active left-border indicator */}
              {isActive && (
                <span
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-r-full"
                  style={{
                    height: 20,
                    background: `linear-gradient(180deg, ${PURPLE}, #EC4899)`,
                  }}
                />
              )}
              <Icon size={16} className="flex-shrink-0" />
              <AnimatePresence initial={false}>
                {!collapsed && (
                  <motion.span
                    key={`label-${href}`}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -8 }}
                    transition={{ duration: 0.14 }}
                    className="text-sm font-medium whitespace-nowrap"
                  >
                    {label}
                  </motion.span>
                )}
              </AnimatePresence>
            </Link>
          );

          return collapsed ? (
            <Tooltip key={href}>
              <TooltipTrigger asChild>{item}</TooltipTrigger>
              <TooltipContent side="right">
                <p>{label}</p>
              </TooltipContent>
            </Tooltip>
          ) : item;
        })}
      </nav>

      {/* ── Bottom: user + logout ── */}
      <div
        className="flex-shrink-0 py-3 px-3 space-y-1"
        style={{ borderTop: `1px solid ${BORDER_CLR}` }}
      >
        {/* User info */}
        <div
          className="flex items-center gap-3 rounded-lg p-2 overflow-hidden"
          style={{ justifyContent: collapsed ? "center" : "flex-start" }}
        >
          <div
            className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
            style={{ background: `linear-gradient(135deg, ${PURPLE}, #EC4899)` }}
          >
            {getInitials(userName)}
          </div>
          <AnimatePresence initial={false}>
            {!collapsed && (
              <motion.div
                key="user-info"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.14 }}
                className="min-w-0"
              >
                <p className="text-xs font-medium text-[#F1F0F5] truncate">{userName}</p>
                <p className="text-[10px] text-[#8B8A9B]">Admin</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Logout */}
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="w-full flex justify-center items-center p-2 rounded-lg transition-colors text-[#8B8A9B]"
                onMouseEnter={e => (e.currentTarget.style.color = "#f87171")}
                onMouseLeave={e => (e.currentTarget.style.color = "#8B8A9B")}
              >
                <LogOut size={15} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right"><p>Logout</p></TooltipContent>
          </Tooltip>
        ) : (
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="w-full flex items-center gap-3 px-2 py-2 rounded-lg text-sm transition-colors text-[#8B8A9B]"
            onMouseEnter={e => {
              e.currentTarget.style.color = "#f87171";
              e.currentTarget.style.background = "rgba(248,113,113,0.06)";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color = "#8B8A9B";
              e.currentTarget.style.background = "transparent";
            }}
          >
            <LogOut size={15} />
            <span>Logout</span>
          </button>
        )}
      </div>
    </motion.aside>
  );
}
