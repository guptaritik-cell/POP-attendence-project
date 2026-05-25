"use client";

import { useState } from "react";
import Image from "next/image";
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
const PURPLE      = "#FF4D00";
const SURFACE     = "#181818";
const BORDER_CLR  = "rgba(255,77,0,0.15)";
const ACTIVE_BG   = "rgba(255,77,0,0.12)";
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
          <Image
            src="/POP.png"
            alt="POP logo"
            width={32}
            height={32}
            className="flex-shrink-0 rounded-full select-none"
          />
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
          style={{ color: "#888888" }}
          onMouseEnter={e => (e.currentTarget.style.color = "#F5F5F5")}
          onMouseLeave={e => (e.currentTarget.style.color = "#888888")}
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
                color: isActive ? "#F5F5F5" : "#888888",
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
                    background: `linear-gradient(180deg, ${PURPLE}, #FF7A35)`,
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
            style={{ background: `linear-gradient(135deg, ${PURPLE}, #FF7A35)` }}
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
                <p className="text-xs font-medium text-[#F5F5F5] truncate">{userName}</p>
                <p className="text-[10px] text-[#888888]">Admin</p>
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
                className="w-full flex justify-center items-center p-2 rounded-lg transition-colors text-[#888888]"
                onMouseEnter={e => (e.currentTarget.style.color = "#f87171")}
                onMouseLeave={e => (e.currentTarget.style.color = "#888888")}
              >
                <LogOut size={15} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right"><p>Logout</p></TooltipContent>
          </Tooltip>
        ) : (
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="w-full flex items-center gap-3 px-2 py-2 rounded-lg text-sm transition-colors text-[#888888]"
            onMouseEnter={e => {
              e.currentTarget.style.color = "#f87171";
              e.currentTarget.style.background = "rgba(248,113,113,0.06)";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color = "#888888";
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
