"use client";

import { FormEvent, Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { login, register } from "@/lib/api";
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
  const [accountName, setAccountName] = useState("");
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
    setAccountName("");
    setNotice("Account created — sign in with your username or email.");
    setError("");
    router.replace("/", { scroll: false });
  }, [searchParams, router]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");

    if (mode === "register") {
      setLoading(true);
      try {
        const response = await register({
          username: username.trim(),
          password,
          email: email.trim(),
          name: accountName.trim() || undefined
        });
        saveSession(response.token, response.parent);
        router.push("/menu");
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : "Registration failed");
      } finally {
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    try {
      const response = await login(username, password);
      saveSession(response.token, response.parent);
      router.push("/menu");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Auth failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="kidPageShell kidPageShell--auth">
      <div className="kidFloatShape kidFloat1" aria-hidden />
      <div className="kidFloatShape kidFloat2" aria-hidden />
      <div className="kidFloatShape kidFloat3" aria-hidden />

      <header className="authSiteHeader">
        <div className="authSiteHeaderInner">
          <div className="authBrandMark authBrandMark--header" aria-hidden>
            N
          </div>
          <div>
            <p className="authSiteTitle">Narria</p>
            <p className="authSiteTagline">Storybook for families</p>
          </div>
        </div>
      </header>

      <div className="authMainWrap">
        <section className="kidCard kidCard--narrow authCard">
          <h1 className="authCardTitle">{mode === "login" ? "Welcome back" : "Join Narria"}</h1>
          <p className="authTagline authTagline--tight">
            {mode === "login"
              ? "Sign in to open your story menu and your child’s profile."
              : "Create an account — we save your details so you can sign in anytime."}
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
                <label className="authLabel" htmlFor="reg-name">
                  Your name
                </label>
                <input
                  id="reg-name"
                  className="authInput"
                  type="text"
                  autoComplete="name"
                  placeholder="e.g. Jamie Rivera"
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                />
              </div>
              <div>
                <label className="authLabel" htmlFor="reg-email">
                  Email
                </label>
                <input
                  id="reg-email"
                  className="authInput"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
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
                  autoComplete="username"
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
                  Username or email
                </label>
                <input
                  id="login-user"
                  className="authInput"
                  placeholder="admin or you@example.com"
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
            {loading
              ? mode === "register"
                ? "Creating account…"
                : "Signing in…"
              : mode === "login"
                ? "Sign in"
                : "Create account"}
          </button>
        </form>

          <p className="authHint">
            Demo accounts:{" "}
            <strong style={{ color: "var(--kid-ink)" }}>admin</strong> /{" "}
            <strong style={{ color: "var(--kid-ink)" }}>admin</strong> or{" "}
            <strong style={{ color: "var(--kid-ink)" }}>demo</strong> /{" "}
            <strong style={{ color: "var(--kid-ink)" }}>demo</strong>
            <br />
            <span style={{ fontSize: "0.88rem", opacity: 0.9 }}>
              You can also sign in with{" "}
              <code style={{ fontSize: "0.85em" }}>admin@narria.local</code>
            </span>
          </p>
        </section>
      </div>

      <footer className="authSiteFooter">
        <p className="authSiteFooterLine">© {new Date().getFullYear()} Narria · Made for family story time</p>
        <p className="authSiteFooterSub">Personalized picture books with audio</p>
      </footer>
    </main>
  );
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="kidPageShellFallback">
          <span>Loading…</span>
        </div>
      }
    >
      <AuthScreen />
    </Suspense>
  );
}
