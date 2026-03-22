"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Legacy route: child name/age + selfie are set together on /profile-photo?mode=create */
export default function ChildProfilePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/profile-photo?mode=create");
  }, [router]);

  return (
    <main className="kidPageShell kidPageShell--center">
      <p className="menuLoading" style={{ marginTop: 24 }}>
        Redirecting…
      </p>
    </main>
  );
}
