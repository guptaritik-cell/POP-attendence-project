"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Eye, EyeOff, Edit2, Loader2, AlertCircle } from "lucide-react";
import Image from "next/image";
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

/* POP logo — actual brand image */
function PopLogo({ size = 56 }: { size?: number }) {
  return (
    <motion.div
      className="select-none"
      style={{ width: size, height: size }}
      animate={{
        filter: [
          "drop-shadow(0 0 10px rgba(255,77,0,0.35))",
          "drop-shadow(0 0 22px rgba(255,77,0,0.65)) drop-shadow(0 0 36px rgba(204,31,0,0.25))",
          "drop-shadow(0 0 10px rgba(255,77,0,0.35))",
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

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// NextAuth redirects back here with ?error=<code> when a provider sign-in
// fails — map its codes to a message that actually tells the user what to do.
function googleSignInErrorMessage(code: string): string {
  switch (code) {
    case "AccessDenied":
      return "This Google account isn't authorized to access this platform.";
    case "OAuthAccountNotLinked":
      return "This Google account isn't linked to any user here.";
    case "OAuthSignin":
    case "OAuthCallback":
    case "OAuthCreateAccount":
    case "Callback":
      return "Something went wrong signing in with Google. Please try again.";
    case "Configuration":
      return "Google sign-in isn't configured correctly. Contact your admin.";
    default:
      return "Sign-in failed. Please try again.";
  }
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
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleError, setGoogleError] = useState("");
  const router = useRouter();
  const emailRef = useRef<HTMLInputElement>(null);

  // NextAuth bounces back to /login?error=<code> on a failed Google sign-in.
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("error");
    if (code) {
      setGoogleError(googleSignInErrorMessage(code));
      router.replace("/login");
    }
  }, [router]);

  function handleGoogleSignIn() {
    setGoogleError("");
    setGoogleLoading(true);
    signIn("google", { callbackUrl: "/dashboard/all-employees" });
  }

  function handleEmailBlur() {
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

                        {/* Email field */}
                        <div className="flex flex-col gap-1.5">
                          <label
                            htmlFor="email"
                            className="text-xs font-medium"
                            style={{ color: "#888888" }}
                          >
                            Email address
                          </label>
                          <Input
                            id="email"
                            ref={emailRef}
                            type="email"
                            autoComplete="email"
                            value={email}
                            onChange={(e) => {
                              setEmail(e.target.value);
                              if (emailError) setEmailError("");
                            }}
                            onBlur={handleEmailBlur}
                            onKeyDown={(e) => e.key === "Enter" && handleContinue()}
                            placeholder="you@company.com"
                            className="h-10 text-sm text-[#F5F5F5] placeholder:text-[#555] placeholder:opacity-60 border-[rgba(255,77,0,0.25)] focus:border-[#FF4D00] focus:ring-1 focus:ring-[#FF4D00]"
                          />
                          <AnimatePresence>
                            {emailError && (
                              <motion.p
                                initial={{ opacity: 0, y: -4 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -4 }}
                                transition={{ duration: 0.15 }}
                                className="text-[11px] text-red-400"
                              >
                                {emailError}
                              </motion.p>
                            )}
                          </AnimatePresence>
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

                        {/* Divider */}
                        <div className="flex items-center gap-3">
                          <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.08)" }} />
                          <span className="text-[11px]" style={{ color: "#555" }}>or</span>
                          <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.08)" }} />
                        </div>

                        {/* Google sign-in */}
                        <button
                          type="button"
                          onClick={handleGoogleSignIn}
                          disabled={googleLoading}
                          className="w-full flex items-center justify-center gap-2.5 py-3 rounded-[12px] text-sm font-semibold transition-colors disabled:opacity-70"
                          style={{
                            background: "#1A1A1A",
                            border: "1px solid rgba(255,255,255,0.12)",
                            color: "#F5F5F5",
                            cursor: googleLoading ? "not-allowed" : "pointer",
                          }}
                        >
                          {googleLoading ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : (
                            <svg width="16" height="16" viewBox="0 0 48 48">
                              <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"/>
                              <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"/>
                              <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"/>
                              <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z"/>
                            </svg>
                          )}
                          Continue with Google
                        </button>

                        <AnimatePresence>
                          {googleError && (
                            <motion.div
                              initial={{ opacity: 0, y: -4 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -4 }}
                              transition={{ duration: 0.15 }}
                              className="flex items-start gap-1.5 text-[12px] text-red-400 -mt-2"
                            >
                              <AlertCircle size={13} className="flex-shrink-0 mt-[1px]" />
                              {googleError}
                            </motion.div>
                          )}
                        </AnimatePresence>
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
                            className="pr-10 text-[#F5F5F5] border-[rgba(255,77,0,0.25)] focus:border-[#FF4D00] focus:ring-1 focus:ring-[#FF4D00]"
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
