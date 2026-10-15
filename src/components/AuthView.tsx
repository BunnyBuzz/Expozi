import { useState } from "react";

interface Props {
  onAuth: (name: string, email: string) => void;
  initialMode?: "signin" | "signup";
  onBack?: () => void;
}

function ExpoziMark() {
  return (
    <svg width="40" height="40" viewBox="0 0 26 26" fill="none" aria-hidden>
      <path d="M13 2 23 7.5 13 13 3 7.5 13 2Z" fill="#0f766e" />
      <path d="M3 12.5 13 18l10-5.5v4L13 22 3 16.5v-4Z" fill="#0f766e" opacity="0.75" />
      <path d="M3 17.5 13 23l10-5.5v1L13 24 3 18.5v-1Z" fill="#0f766e" opacity="0.5" />
    </svg>
  );
}

function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      />
    </svg>
  );
}

export default function AuthView({ onAuth, initialMode = "signin", onBack }: Props) {
  const [mode, setMode] = useState<"signin" | "signup">(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Enter a valid email address.");
      return;
    }
    setError("");
    onAuth(mode === "signup" ? name : "", email.trim());
  };

  return (
    <div className="relative flex h-screen items-center justify-center overflow-y-auto bg-[#faf9f6] px-4">
      {onBack && (
        <button onClick={onBack} className="absolute left-6 top-6 text-[15px] font-medium text-gray-500 hover:text-gray-800">
          ← Back
        </button>
      )}
      <div className="w-full max-w-[420px] rounded-2xl border border-gray-200 bg-white px-8 py-9 shadow-[0_16px_48px_rgba(0,0,0,0.08)]">
        <div className="flex flex-col items-center text-center">
          <ExpoziMark />
          <h1 className="mt-4 text-[24px] font-semibold text-gray-900">
            {mode === "signin" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="mt-1 text-[14px] text-gray-500">
            {mode === "signin" ? "Sign in to continue to Expozi" : "Start exposing research in seconds"}
          </p>
        </div>

        <button
          onClick={() => onAuth("", "researcher@expozi.app")}
          className="mt-6 flex w-full items-center justify-center gap-2.5 rounded-xl border border-gray-300 py-2.5 text-[15px] font-medium text-gray-800 hover:bg-gray-50"
        >
          <GoogleG />
          Continue with Google
        </button>

        <div className="my-5 flex items-center gap-3 text-xs text-gray-400">
          <span className="h-px flex-1 bg-gray-200" />
          or continue with email
          <span className="h-px flex-1 bg-gray-200" />
        </div>

        <form onSubmit={submit}>
          {mode === "signup" && (
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name"
              autoComplete="name"
              className="mb-3 w-full rounded-xl border border-gray-300 px-4 py-2.5 text-[15px] outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
            />
          )}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email address"
            autoComplete="email"
            className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-[15px] outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
          />
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            className="mt-3 w-full rounded-xl bg-teal-700 py-2.5 text-[15px] font-medium text-white hover:bg-teal-800"
          >
            {mode === "signin" ? "Continue" : "Sign up"}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-gray-600">
          {mode === "signin" ? (
            <>
              New here?{" "}
              <button onClick={() => { setMode("signup"); setError(""); }} className="font-medium text-teal-700 hover:underline">
                Create account
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button onClick={() => { setMode("signin"); setError(""); }} className="font-medium text-teal-700 hover:underline">
                Sign in
              </button>
            </>
          )}
        </p>

        <p className="mt-6 text-center text-xs leading-relaxed text-gray-400">
          By continuing, you agree to Expozi&apos;s Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );
}
