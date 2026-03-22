"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createChildProfile, getChildProfile } from "@/lib/api";
import {
  getParentFromSession,
  getTokenFromSession,
  patchParentInSession,
  saveSession
} from "@/lib/session";

export default function ChildProfilePage() {
  const router = useRouter();
  const [childName, setChildName] = useState("");
  const [age, setAge] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const parent = getParentFromSession();
    if (!parent) {
      router.replace("/");
      return;
    }
    getChildProfile(parent.id)
      .then((response) => {
        if (response.child) {
          router.replace("/menu");
        }
      })
      .catch(() => setError("Could not load child profile status."));
  }, [router]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const parent = getParentFromSession();
    if (!parent) {
      router.replace("/");
      return;
    }
    try {
      const response = await createChildProfile({
        parentId: parent.id,
        childName,
        age: age ? Number(age) : undefined
      });
      const token = getTokenFromSession();
      if (token) {
        saveSession(token, response.parent);
      } else {
        patchParentInSession({
          childName: response.parent.childName ?? null,
          childAge: response.parent.childAge ?? null
        });
      }
      router.push("/menu");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Profile creation failed");
    }
  }

  return (
    <main className="kidPageShell kidPageShell--center">
      <div className="kidFloatShape kidFloat1" aria-hidden />
      <div className="kidFloatShape kidFloat2" aria-hidden />
      <div className="kidFloatShape kidFloat3" aria-hidden />

      <section className="kidCard kidCard--narrow">
        <h1 className="title">Create Child Profile ✨</h1>
        <p className="subtitle">Tell us a little about your reader — then the story menu opens!</p>
        <form className="formGrid" onSubmit={onSubmit}>
          <label className="authLabel" htmlFor="child-name">
            Child&apos;s name
          </label>
          <input
            id="child-name"
            className="input"
            placeholder="e.g. Sam"
            value={childName}
            onChange={(event) => setChildName(event.target.value)}
            required
            autoComplete="nickname"
          />
          <label className="authLabel" htmlFor="child-age">
            Age <span style={{ fontWeight: 600, textTransform: "none", letterSpacing: "normal" }}>(optional)</span>
          </label>
          <input
            id="child-age"
            className="input"
            placeholder="e.g. 7"
            type="number"
            inputMode="numeric"
            min={1}
            max={18}
            value={age}
            onChange={(event) => setAge(event.target.value)}
            aria-describedby="child-age-hint"
          />
          <p id="child-age-hint" className="authHint" style={{ marginTop: 0, marginBottom: 0, textAlign: "left" }}>
            Helps us keep stories age-appropriate. You can skip this.
          </p>
          <button className="menuButton" type="submit">
            Save Child Profile
          </button>
          {error ? <p className="authError">{error}</p> : null}
        </form>
      </section>
    </main>
  );
}
