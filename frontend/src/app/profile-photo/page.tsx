import { Suspense } from "react";
import ProfilePhotoClient from "./ProfilePhotoClient";

function ProfilePhotoFallback() {
  return (
    <main className="kidPageShell kidPageShell--center">
      <div className="kidFloatShape kidFloat1" aria-hidden />
      <div className="kidFloatShape kidFloat2" aria-hidden />
      <div className="kidFloatShape kidFloat3" aria-hidden />
      <p className="menuLoading" style={{ marginTop: 24 }}>
        Loading…
      </p>
    </main>
  );
}

export default function ProfilePhotoPage() {
  return (
    <Suspense fallback={<ProfilePhotoFallback />}>
      <ProfilePhotoClient />
    </Suspense>
  );
}
