"use client";

import { useTheme } from "next-themes";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";

/* Sun rays that radiate out */
const SunIcon = () => (
  <motion.svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="4" />
    <motion.g
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.25 }}
    >
      <line x1="12" y1="2"  x2="12" y2="6"  />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="4.22" y1="4.22"   x2="7.05" y2="7.05"   />
      <line x1="16.95" y1="16.95" x2="19.78" y2="19.78" />
      <line x1="2"  y1="12" x2="6"  y2="12" />
      <line x1="18" y1="12" x2="22" y2="12" />
      <line x1="4.22"  y1="19.78" x2="7.05"  y2="16.95" />
      <line x1="16.95" y1="7.05"  x2="19.78" y2="4.22"  />
    </motion.g>
  </motion.svg>
);

const MoonIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  /* Avoid hydration mismatch */
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="w-8 h-8" />;

  const isDark = theme === "dark";

  return (
    <motion.button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
      className="relative w-8 h-8 flex items-center justify-center rounded-lg overflow-hidden select-none"
      style={{
        background: "rgba(255,77,0,0.1)",
        border: "1px solid rgba(255,77,0,0.25)",
        color: "#FF7A35",
      }}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      <AnimatePresence mode="wait" initial={false}>
        {isDark ? (
          <motion.div
            key="moon"
            initial={{ y: 12, opacity: 0, rotate: -30 }}
            animate={{ y: 0,  opacity: 1, rotate: 0 }}
            exit={{   y: -12, opacity: 0, rotate: 30  }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
          >
            <MoonIcon />
          </motion.div>
        ) : (
          <motion.div
            key="sun"
            initial={{ y: 12, opacity: 0, rotate: 30  }}
            animate={{ y: 0,  opacity: 1, rotate: 0   }}
            exit={{   y: -12, opacity: 0, rotate: -30  }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            style={{ color: "#fbbf24" }}
          >
            <SunIcon />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.button>
  );
}
