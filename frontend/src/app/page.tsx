"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { login, register } from "@/lib/api";
import { saveSession } from "@/lib/session";

export default function Home() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response =
        mode === "login"
          ? await login(username, password)
          : await register(username, password);
      saveSession(response.token, response.parent);
      router.push("/child-profile");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Auth failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="screen">
      <section className="panel">
        <h1 className="title">Narria Storybook</h1>
        <p className="subtitle">Parent login or register to begin.</p>

        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <button className="menuButton" onClick={() => setMode("login")}>
            Login
          </button>
          <button className="menuButton secondaryButton" onClick={() => setMode("register")}>
            Register
          </button>
        </div>

        <form className="formGrid" onSubmit={onSubmit}>
          <input
            className="input"
            placeholder="username (demo)"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
          />
          <input
            className="input"
            placeholder="password (demo)"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          <button className="menuButton" type="submit" disabled={loading}>
            {loading ? "Please wait..." : mode === "login" ? "Login" : "Register"}
          </button>
          {error ? <p style={{ color: "#ffbaba" }}>{error}</p> : null}
        </form>
      </section>
    </main>
  );
}
