"use client";

import { FormEvent, Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { login } from "@/lib/api";
import { saveSession } from "@/lib/session";

const DEMO_ADMIN_USER = "admin";
const DEMO_ADMIN_PASS = "admin";

function AuthScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromRegisterHandled = useRef(false);

  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (fromRegisterHandled.current) return;
    if (searchParams.get("fromRegister") !== "1") return;
    fromRegisterHandled.current = true;
    setMode("login");
    setUsername(DEMO_ADMIN_USER);
    setPassword(DEMO_ADMIN_PASS);
    setEmail("");
    setNotice(
      "Register is demo-only — nothing was saved. Use admin / admin below (already filled)."
    );
    setError("");
    router.replace("/", { scroll: false });
  }, [searchParams, router]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");

    if (mode === "register") {
      // No API call, no persistence — send user to login with admin credentials prefilled.
      router.push("/?fromRegister=1");
      return;
    }

    setLoading(true);
    try {
      const response = await login(username, password);
      saveSession(response.token, response.parent);
      router.push("/child-profile");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Auth failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="authShell">
      <div className="authOrb authOrb1" aria-hidden />
      <div className="authOrb authOrb2" aria-hidden />
      <div className="authOrb authOrb3" aria-hidden />

      <section className="authCard">
        <div className="authBrand">
          <div className="authBrandMark" aria-hidden>
            N
          </div>
          <div>
            <h1 className="authTitle">Narria</h1>
            <p className="authTagline" style={{ marginBottom: 0 }}>
              Storybook for families
            </p>
          </div>
        </div>
        <p className="authTagline">
          {mode === "login"
            ? "Sign in to continue to your child’s profile and stories."
            : "Create a demo account — you’ll be taken to login with admin access."}
        </p>

        <div className="authTabs" role="tablist" aria-label="Authentication mode">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "login"}
            className={`authTab ${mode === "login" ? "authTabActive" : ""}`}
            onClick={() => {
              setMode("login");
              setError("");
              setNotice("");
            }}
          >
            Login
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "register"}
            className={`authTab ${mode === "register" ? "authTabActive" : ""}`}
            onClick={() => {
              setMode("register");
              setError("");
              setNotice("");
            }}
          >
            Register
          </button>
        </div>

        {notice ? <p className="authNotice">{notice}</p> : null}
        {error ? <p className="authError">{error}</p> : null}

        <form className="authForm" onSubmit={onSubmit}>
          {mode === "register" ? (
            <>
              <div>
                <label className="authLabel" htmlFor="reg-email">
                  Email (optional)
                </label>
                <input
                  id="reg-email"
                  className="authInput"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div>
                <label className="authLabel" htmlFor="reg-user">
                  Username
                </label>
                <input
                  id="reg-user"
                  className="authInput"
                  placeholder="Choose a username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="authLabel" htmlFor="reg-pass">
                  Password
                </label>
                <input
                  id="reg-pass"
                  className="authInput"
                  type="password"
                  autoComplete="new-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={4}
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="authLabel" htmlFor="login-user">
                  Username
                </label>
                <input
                  id="login-user"
                  className="authInput"
                  placeholder="admin"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  autoComplete="username"
                />
              </div>
              <div>
                <label className="authLabel" htmlFor="login-pass">
                  Password
                </label>
                <input
                  id="login-pass"
                  className="authInput"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>
            </>
          )}

          <button className="authSubmit" type="submit" disabled={loading}>
            {loading ? "Signing in…" : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>

        <p className="authHint">
          Hackathon demo · Real accounts: <strong style={{ color: "rgba(245,239,255,0.5)" }}>admin</strong> /{" "}
          <strong style={{ color: "rgba(245,239,255,0.5)" }}>admin</strong> or{" "}
          <strong style={{ color: "rgba(245,239,255,0.5)" }}>demo</strong> /{" "}
          <strong style={{ color: "rgba(245,239,255,0.5)" }}>demo</strong>
        </p>
      </section>
    </main>
  );
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="authShell authShellFallback">
          <span>Loading…</span>
        </div>
      }
    >
      <AuthScreen />
    </Suspense>
  );
}
