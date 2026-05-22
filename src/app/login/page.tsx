"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Eye, EyeOff, Edit2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

/* Ambient orbs */
const orbs = [
  {
    size: 520,
    color: "radial-gradient(circle, rgba(255,77,0,0.55) 0%, transparent 70%)",
    animate: { x: [-200, -110, -200], y: [-140, -50, -140] },
    duration: 9,
  },
  {
    size: 460,
    color: "radial-gradient(circle, rgba(204,31,0,0.45) 0%, transparent 70%)",
    animate: { x: [160, 240, 160], y: [110, 190, 110] },
    duration: 11,
  },
  {
    size: 380,
    color: "radial-gradient(circle, rgba(255,122,53,0.3) 0%, transparent 70%)",
    animate: { x: [-40, 50, -40], y: [210, 140, 210] },
    duration: 13,
  },
];

/* POP logo — same as landing page */
function PopLogo({ size = 56 }: { size?: number }) {
  return (
    <motion.div
      className="relative flex items-center justify-center select-none overflow-hidden"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background:
          "radial-gradient(circle at 38% 32%, #FF7A35 0%, #FF4D00 42%, #CC1F00 78%, #8B1500 100%)",
        boxShadow:
          "0 0 0 2px rgba(255,122,53,0.2), inset 0 1px 1px rgba(255,255,255,0.18)",
      }}
      animate={{
        boxShadow: [
          "0 0 0 2px rgba(255,122,53,0.15), 0 0 20px rgba(255,77,0,0.4), inset 0 1px 1px rgba(255,255,255,0.18)",
          "0 0 0 3px rgba(255,122,53,0.1), 0 0 38px rgba(255,77,0,0.65), inset 0 1px 1px rgba(255,255,255,0.18)",
          "0 0 0 2px rgba(255,122,53,0.15), 0 0 20px rgba(255,77,0,0.4), inset 0 1px 1px rgba(255,255,255,0.18)",
        ],
      }}
      transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
    >
      <div
        className="absolute inset-0 rounded-full pointer-events-none"
        style={{
          background:
            "linear-gradient(135deg, rgba(255,255,255,0.22) 0%, transparent 55%, rgba(0,0,0,0.15) 100%)",
        }}
      />
      <span
        style={{
          fontFamily: "Inter, sans-serif",
          fontSize: size * 0.52,
          fontWeight: 900,
          color: "#FFFFFF",
          letterSpacing: "-0.03em",
          lineHeight: 1,
          position: "relative",
          top: size * 0.04,
          textShadow: "0 2px 8px rgba(0,0,0,0.35)",
        }}
      >
        p
      </span>
    </motion.div>
  );
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/* Slide variants */
const slide = {
  enterRight: { x: 80, opacity: 0 },
  enterLeft:  { x: -80, opacity: 0 },
  center:     { x: 0, opacity: 1 },
  exitLeft:   { x: -80, opacity: 0 },
};

export default function LoginPage() {
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const router = useRouter();
  const emailRef = useRef<HTMLInputElement>(null);

  function handleEmailBlur() {
    setEmailFocused(false);
    if (email && !isValidEmail(email)) {
      setEmailError("Please enter a valid email address");
    } else {
      setEmailError("");
    }
  }

  function handleContinue() {
    if (!email) { setEmailError("Email is required"); return; }
    if (!isValidEmail(email)) { setEmailError("Please enter a valid email address"); return; }
    setEmailError("");
    setStep(2);
  }

  async function handleSignIn() {
    if (!password) return;
    setLoading(true);
    try {
      const result = await signIn("credentials", { email, password, redirect: false });
      if (result?.ok) {
        router.push("/dashboard");
      } else {
        toast.error("Invalid credentials. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  const gradientBg =
    "radial-gradient(circle at 35% 35%, #FF7A35 0%, #FF4D00 55%, #CC1F00 100%)";
  const gradientShadow =
    "0 4px 28px rgba(255,77,0,0.45), inset 0 1px 1px rgba(255,255,255,0.12)";

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

      {/* Vignette */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at 50% 50%, transparent 40%, rgba(0,0,0,0.6) 100%)",
        }}
      />

      {/* Card */}
      <motion.div
        className="relative z-10 w-full max-w-[400px] px-4"
        initial={{ opacity: 0, y: 36 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.48, ease: [0.0, 0.0, 0.2, 1] }}
      >
        <div
          className="relative rounded-[16px] overflow-hidden"
          style={{
            background: "#181818",
            border: "1px solid rgba(255,77,0,0.22)",
            boxShadow:
              "0 0 40px rgba(255,77,0,0.1), 0 24px 64px rgba(0,0,0,0.6)",
          }}
        >
          {/* Loading shimmer border */}
          <AnimatePresence>
            {loading && (
              <motion.div
                className="absolute inset-0 rounded-[16px] pointer-events-none z-50 shimmer-border"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={{ padding: 1 }}
              />
            )}
          </AnimatePresence>

          <Card className="border-0 shadow-none" style={{ background: "transparent" }}>
            {/* Header — logo only */}
            <CardHeader className="flex flex-col items-center pt-8 pb-2 gap-0">
              <PopLogo size={60} />
            </CardHeader>

            <CardContent className="px-8 pb-9 pt-5">
              <div className="overflow-hidden">
                <AnimatePresence mode="wait">
                  {step === 1 ? (
                    /* ── STEP 1: Email ── */
                    <motion.div
                      key="step1"
                      initial="enterLeft"
                      animate="center"
                      exit="exitLeft"
                      variants={slide}
                      transition={{ duration: 0.32, ease: [0.4, 0, 0.2, 1] }}
                    >
                      <div className="flex flex-col gap-5">
                        <div className="text-center">
                          <h1 className="text-[22px] font-bold text-[#F5F5F5] tracking-tight">
                            Welcome Back
                          </h1>
                          <p className="text-[13px] mt-1" style={{ color: "#888" }}>
                            Sign in to POP Attendance
                          </p>
                        </div>

                        {/* Email with floating label */}
                        <div className="relative">
                          <motion.label
                            htmlFor="email"
                            className="absolute left-3 pointer-events-none origin-left"
                            style={{ top: 10, fontSize: 14, color: "#888" }}
                            animate={
                              emailFocused || email
                                ? { y: -22, scale: 0.8, color: "#FF7A35" }
                                : { y: 0, scale: 1, color: "#888888" }
                            }
                            transition={{ duration: 0.18 }}
                          >
                            Email address
                          </motion.label>
                          <Input
                            id="email"
                            ref={emailRef}
                            type="email"
                            value={email}
                            onChange={(e) => {
                              setEmail(e.target.value);
                              if (emailError) setEmailError("");
                            }}
                            onFocus={() => setEmailFocused(true)}
                            onBlur={handleEmailBlur}
                            onKeyDown={(e) => e.key === "Enter" && handleContinue()}
                            placeholder=" "
                            className="pt-5 pb-2 bg-[#222] text-[#F5F5F5] placeholder-transparent border-[rgba(255,77,0,0.25)] focus:border-[#FF4D00] focus:ring-1 focus:ring-[#FF4D00]"
                          />
                          {emailError && (
                            <motion.p
                              initial={{ opacity: 0, y: -4 }}
                              animate={{ opacity: 1, y: 0 }}
                              className="text-xs text-red-400 mt-1"
                            >
                              {emailError}
                            </motion.p>
                          )}
                        </div>

                        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
                          <Button
                            onClick={handleContinue}
                            className="w-full py-3 rounded-[12px] text-white font-bold text-[14px] border-0 tracking-wide"
                            style={{ background: gradientBg, boxShadow: gradientShadow }}
                          >
                            Continue →
                          </Button>
                        </motion.div>
                      </div>
                    </motion.div>
                  ) : (
                    /* ── STEP 2: Password ── */
                    <motion.div
                      key="step2"
                      initial="enterRight"
                      animate="center"
                      exit="exitLeft"
                      variants={slide}
                      transition={{ duration: 0.32, ease: [0.4, 0, 0.2, 1] }}
                    >
                      <div className="flex flex-col gap-5">
                        <div className="text-center">
                          <h1 className="text-[22px] font-bold text-[#F5F5F5] tracking-tight">
                            Welcome Back
                          </h1>
                          <p className="text-[13px] mt-1" style={{ color: "#888" }}>
                            Sign in to POP Attendance
                          </p>
                        </div>

                        {/* Email chip */}
                        <div className="flex items-center gap-2">
                          <div
                            className="flex items-center gap-2 px-3 py-2 rounded-[20px] text-sm text-[#F5F5F5] flex-1 min-w-0"
                            style={{
                              background: "rgba(255,77,0,0.1)",
                              border: "1px solid rgba(255,77,0,0.25)",
                            }}
                          >
                            <span className="truncate text-[13px]">{email}</span>
                          </div>
                          <button
                            onClick={() => { setStep(1); setPassword(""); }}
                            className="flex items-center justify-center w-8 h-8 rounded-full transition-colors"
                            style={{ color: "#888" }}
                            onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#FF7A35")}
                            onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#888")}
                            title="Edit email"
                          >
                            <Edit2 size={13} />
                          </button>
                        </div>

                        {/* Password */}
                        <div className="relative">
                          <Input
                            id="password"
                            type={showPassword ? "text" : "password"}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleSignIn()}
                            placeholder="Password"
                            className="pr-10 bg-[#222] text-[#F5F5F5] border-[rgba(255,77,0,0.25)] focus:border-[#FF4D00] focus:ring-1 focus:ring-[#FF4D00]"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword((v) => !v)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                            style={{ color: "#888" }}
                            onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#F5F5F5")}
                            onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#888")}
                          >
                            {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                          </button>
                        </div>

                        <motion.div
                          whileHover={!loading ? { scale: 1.02 } : {}}
                          whileTap={!loading ? { scale: 0.97 } : {}}
                        >
                          <Button
                            onClick={handleSignIn}
                            disabled={loading || !password}
                            className="w-full py-3 rounded-[12px] text-white font-bold text-[14px] border-0 disabled:opacity-70 tracking-wide"
                            style={{
                              background: gradientBg,
                              boxShadow: loading
                                ? "0 4px 40px rgba(255,77,0,0.65)"
                                : gradientShadow,
                            }}
                          >
                            {loading ? (
                              <span className="flex items-center gap-2">
                                <Loader2 size={15} className="animate-spin" />
                                Signing in…
                              </span>
                            ) : (
                              "Sign In"
                            )}
                          </Button>
                        </motion.div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Footer */}
        <p className="text-center mt-5 text-[12px]" style={{ color: "#555" }}>
          POP Private Limited &nbsp;&middot;&nbsp; Internal HR Platform
        </p>
      </motion.div>
    </main>
  );
}
