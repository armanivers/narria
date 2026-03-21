"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createChildProfile, getChildProfile } from "@/lib/api";
import { getParentFromSession } from "@/lib/session";

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
      await createChildProfile({
        parentId: parent.id,
        childName,
        age: age ? Number(age) : undefined
      });
      router.push("/menu");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Profile creation failed");
    }
  }

  return (
    <main className="screen">
      <section className="panel">
        <h1 className="title">Create Child Profile</h1>
        <p className="subtitle">Create once, then jump directly into stories next time.</p>
        <form className="formGrid" onSubmit={onSubmit}>
          <input
            className="input"
            placeholder="Child name"
            value={childName}
            onChange={(event) => setChildName(event.target.value)}
            required
          />
          <input
            className="input"
            placeholder="Age (optional)"
            type="number"
            min={1}
            max={18}
            value={age}
            onChange={(event) => setAge(event.target.value)}
          />
          <button className="menuButton" type="submit">
            Save Child Profile
          </button>
          {error ? <p style={{ color: "#ffbaba" }}>{error}</p> : null}
        </form>
      </section>
    </main>
  );
}
