"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

/* Three drifting orbs — warm orange-red palette */
const orbs = [
  {
    size: 560,
    color: "radial-gradient(circle, rgba(255,77,0,0.55) 0%, transparent 70%)",
    animate: { x: [-220, -120, -220], y: [-160, -60, -160] },
    duration: 9,
  },
  {
    size: 480,
    color: "radial-gradient(circle, rgba(204,31,0,0.45) 0%, transparent 70%)",
    animate: { x: [180, 260, 180], y: [120, 200, 120] },
    duration: 11,
  },
  {
    size: 420,
    color: "radial-gradient(circle, rgba(255,122,53,0.35) 0%, transparent 70%)",
    animate: { x: [-60, 40, -60], y: [220, 140, 220] },
    duration: 13,
  },
];

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.14 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.0, 0.0, 0.2, 1] as const } },
};

/* POP "p" logo — matches the round orange-red metallic icon */
function PopLogo({ size = 72 }: { size?: number }) {
  return (
    <motion.div
      className="relative flex items-center justify-center select-none overflow-hidden"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        /* Brushed radial gradient matching the real POP icon */
        background:
          "radial-gradient(circle at 38% 32%, #FF7A35 0%, #FF4D00 42%, #CC1F00 78%, #8B1500 100%)",
        boxShadow:
          "0 0 0 2px rgba(255,122,53,0.25), inset 0 1px 1px rgba(255,255,255,0.18)",
      }}
      animate={{
        boxShadow: [
          "0 0 0 2px rgba(255,122,53,0.2), 0 0 24px rgba(255,77,0,0.4), inset 0 1px 1px rgba(255,255,255,0.18)",
          "0 0 0 4px rgba(255,122,53,0.15), 0 0 48px rgba(255,77,0,0.7), 0 0 72px rgba(204,31,0,0.3), inset 0 1px 1px rgba(255,255,255,0.18)",
          "0 0 0 2px rgba(255,122,53,0.2), 0 0 24px rgba(255,77,0,0.4), inset 0 1px 1px rgba(255,255,255,0.18)",
        ],
      }}
      transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
    >
      {/* Metallic sheen overlay */}
      <div
        className="absolute inset-0 rounded-full pointer-events-none"
        style={{
          background:
            "linear-gradient(135deg, rgba(255,255,255,0.22) 0%, transparent 55%, rgba(0,0,0,0.15) 100%)",
        }}
      />
      {/* Lowercase "p" — matches real POP logo */}
      <span
        style={{
          fontFamily: "Inter, sans-serif",
          fontSize: size * 0.52,
          fontWeight: 900,
          color: "#FFFFFF",
          letterSpacing: "-0.03em",
          lineHeight: 1,
          position: "relative",
          top: size * 0.04,          /* slight optical descent for "p" */
          textShadow: "0 2px 8px rgba(0,0,0,0.35)",
        }}
      >
        p
      </span>
    </motion.div>
  );
}

export default function LandingPage() {
  const router = useRouter();

  return (
    <main className="relative min-h-screen flex items-center justify-center overflow-hidden bg-[#0D0D0D]">
      {/* Ambient orbs */}
      {orbs.map((orb, i) => (
        <motion.div
          key={i}
          className="absolute pointer-events-none"
          style={{
            width: orb.size,
            height: orb.size,
            background: orb.color,
            borderRadius: "50%",
            filter: "blur(90px)",
            opacity: 0.18,
          }}
          animate={orb.animate}
          transition={{
            duration: orb.duration,
            repeat: Infinity,
            repeatType: "mirror",
            ease: "easeInOut",
          }}
        />
      ))}

      {/* Subtle noise-texture vignette */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at 50% 50%, transparent 40%, rgba(0,0,0,0.55) 100%)",
        }}
      />

      {/* Main content */}
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
            className="font-black tracking-tight text-white"
            style={{ fontSize: 42, lineHeight: 1.1, letterSpacing: "-0.03em" }}
          >
            Attendance,{" "}
            <span
              style={{
                background: "linear-gradient(90deg, #FF7A35, #FF4D00)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Reimagined
            </span>
          </h1>
          <p className="text-[15px]" style={{ color: "#888888" }}>
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
