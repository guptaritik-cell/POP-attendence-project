"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";

const ASSET_MANAGEMENT_URL = "https://example.com/pop-asset-management";

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.0, 0.0, 0.2, 1] as const } },
};

function OptionCard({
  title,
  subtitle,
  onClick,
}: {
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <motion.button
      variants={fadeUp}
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 380, damping: 22 }}
      onClick={onClick}
      className="flex flex-col items-start justify-between rounded-2xl px-7 py-8 text-left cursor-pointer"
      style={{
        width: 280,
        height: 180,
        background: "#181818",
        border: "1px solid rgba(255,77,0,0.18)",
        boxShadow: "0 4px 28px rgba(0,0,0,0.35)",
      }}
    >
      <h2
        className="text-[22px] font-bold"
        style={{
          background: "linear-gradient(90deg, #FF7A35, #FF4D00)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
        }}
      >
        {title}
      </h2>
      <p className="text-[13px]" style={{ color: "#999999" }}>
        {subtitle}
      </p>
    </motion.button>
  );
}

export function HomeClient() {
  const router = useRouter();

  return (
    <main className="relative min-h-screen flex items-center justify-center overflow-hidden bg-[#0D0D0D]">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at 50% 50%, rgba(13,13,13,0.25) 0%, rgba(13,13,13,0.72) 100%)",
        }}
      />

      <motion.div
        className="relative z-10 flex flex-col items-center gap-10 px-6 text-center"
        variants={stagger}
        initial="hidden"
        animate="visible"
      >
        <motion.h1
          variants={fadeUp}
          className="tracking-tight"
          style={{
            fontFamily: "var(--font-awesome-serif)",
            fontWeight: 800,
            fontStyle: "italic",
            fontSize: 40,
            color: "#F5F5F5",
          }}
        >
          Choose a workspace
        </motion.h1>

        <motion.div variants={stagger} className="flex flex-wrap items-center justify-center gap-6">
          <OptionCard
            title="POP Attendance"
            subtitle="Track and manage employee attendance"
            onClick={() => router.push("/dashboard")}
          />
          <OptionCard
            title="POP Asset Management"
            subtitle="Manage company assets"
            onClick={() => router.push("/asset-management")}
          />
        </motion.div>
      </motion.div>
    </main>
  );
}
