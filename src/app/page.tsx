"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

/* Load Silk lazily — WebGL / Three.js must run client-side only */
const Silk = dynamic(() => import("@/components/Silk"), { ssr: false });

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.14 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.0, 0.0, 0.2, 1] as const } },
};

/* POP logo — actual brand image */
function PopLogo({ size = 72 }: { size?: number }) {
  return (
    <motion.div
      className="select-none"
      style={{ width: size, height: size }}
      animate={{
        filter: [
          "drop-shadow(0 0 12px rgba(255,77,0,0.4))",
          "drop-shadow(0 0 28px rgba(255,77,0,0.75)) drop-shadow(0 0 48px rgba(204,31,0,0.3))",
          "drop-shadow(0 0 12px rgba(255,77,0,0.4))",
        ],
      }}
      transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
    >
      <Image
        src="/POP.png"
        alt="POP logo"
        width={size}
        height={size}
        className="rounded-full"
        priority
      />
    </motion.div>
  );
}

export default function LandingPage() {
  const router = useRouter();

  return (
    <main className="relative min-h-screen flex items-center justify-center overflow-hidden bg-[#0D0D0D]">

      {/* ── Silk WebGL background ── */}
      <div className="absolute inset-0 pointer-events-none" style={{ opacity: 0.9 }}>
        <Silk
          speed={2.7}
          scale={0.4}
          color="#F97316"
          noiseIntensity={0.2}
          rotation={1.9}
        />
      </div>

      {/* Dark vignette so text stays legible */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at 50% 50%, rgba(13,13,13,0.25) 0%, rgba(13,13,13,0.72) 100%)",
        }}
      />

      {/* ── Main content ── */}
      <motion.div
        className="relative z-10 flex flex-col items-center gap-7 px-6 text-center"
        variants={stagger}
        initial="hidden"
        animate="visible"
      >
        {/* Logo */}
        <motion.div variants={fadeUp}>
          <PopLogo size={80} />
        </motion.div>

        {/* Wordmark */}
        <motion.div variants={fadeUp} className="flex flex-col items-center gap-2">
          <h1
            className="tracking-tight"
            style={{
              fontFamily: "var(--font-awesome-serif)",
              fontWeight: 800,
              fontStyle: "italic",
              fontSize: 68,
              lineHeight: 1.15,
              letterSpacing: "-0.01em",
              paddingBottom: "0.12em", /* room for tall descenders like 'd' */
              background: "linear-gradient(90deg, #FF7A35, #FF4D00)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            Attendance,{" "}Reimagined
          </h1>
          <p className="text-[15px]" style={{ color: "#aaaaaa" }}>
            POP Private Limited &nbsp;&middot;&nbsp; Internal HR Platform
          </p>
        </motion.div>

        {/* CTA */}
        <motion.div variants={fadeUp}>
          <motion.div
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.97 }}
            transition={{ type: "spring", stiffness: 380, damping: 22 }}
          >
            <Button
              onClick={() => router.push("/login")}
              className="px-9 py-3 rounded-[20px] text-white font-bold text-[15px] border-0 cursor-pointer tracking-wide"
              style={{
                background:
                  "radial-gradient(circle at 35% 35%, #FF7A35 0%, #FF4D00 55%, #CC1F00 100%)",
                boxShadow:
                  "0 4px 28px rgba(255,77,0,0.45), inset 0 1px 1px rgba(255,255,255,0.15)",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.boxShadow =
                  "0 4px 48px rgba(255,77,0,0.7), 0 0 72px rgba(204,31,0,0.3), inset 0 1px 1px rgba(255,255,255,0.15)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.boxShadow =
                  "0 4px 28px rgba(255,77,0,0.45), inset 0 1px 1px rgba(255,255,255,0.15)";
              }}
            >
              Get Started →
            </Button>
          </motion.div>
        </motion.div>
      </motion.div>
    </main>
  );
}
