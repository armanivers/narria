"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  createChildProfile,
  getChildProfile,
  getProfilePhoto,
  resolveBackendAssetUrl,
  saveProfilePhoto
} from "@/lib/api";
import {
  getParentFromSession,
  getTokenFromSession,
  patchParentInSession,
  saveSession
} from "@/lib/session";

type FlowStep = "intro" | "camera" | "preview" | "done";

export default function ProfilePhotoPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  /** Primitives for effect deps (stable length; avoids HMR / React “deps array size changed”). */
  const modeParam = searchParams.get("mode") || "create";
  const isEdit = modeParam === "edit";

  const [step, setStep] = useState<FlowStep>("intro");
  const [error, setError] = useState("");
  const [childName, setChildName] = useState("");
  const [age, setAge] = useState("");
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [savedPhotoUrl, setSavedPhotoUrl] = useState<string | null>(null);
  const [cartoonPhotoUrl, setCartoonPhotoUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [photoCacheBust, setPhotoCacheBust] = useState(0);
  /** True while we’re polling after a save until the cartoon file appears (or timeout). */
  const [awaitingCartoon, setAwaitingCartoon] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const photoPollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const photoPollAttemptsRef = useRef(0);
  const parent = getParentFromSession();
  const parentId = parent?.id ?? "";

  const stopPhotoPolling = useCallback(() => {
    if (photoPollIntervalRef.current) {
      clearInterval(photoPollIntervalRef.current);
      photoPollIntervalRef.current = null;
    }
    photoPollAttemptsRef.current = 0;
    setAwaitingCartoon(false);
  }, []);

  /** Stable: reads session inside so `parent` object identity doesn’t churn every render. */
  const fetchPhotosFromServer = useCallback(async () => {
    const p = getParentFromSession();
    if (!p) return null;
    const response = await getProfilePhoto(p.id);
    setSavedPhotoUrl(response.photoUrl);
    setCartoonPhotoUrl(response.cartoonPhotoUrl);
    setPhotoCacheBust((n) => n + 1);
    return response;
  }, []);

  const refreshPhotos = useCallback(() => {
    void fetchPhotosFromServer().catch(() => {});
  }, [fetchPhotosFromServer]);

  /**
   * After a new selfie, the cartoon is generated async on the server. Poll until it exists or cap.
   */
  const startPhotoPollingForCartoon = useCallback(() => {
    if (!getParentFromSession()) return;
    stopPhotoPolling();
    setAwaitingCartoon(true);

    const maxAttempts = 40;
    const intervalMs = 2500;

    const tick = async () => {
      photoPollAttemptsRef.current += 1;
      try {
        const response = await fetchPhotosFromServer();
        const hasCartoon = Boolean(response?.cartoonPhotoUrl);
        if (hasCartoon || photoPollAttemptsRef.current >= maxAttempts) {
          stopPhotoPolling();
        }
      } catch {
        if (photoPollAttemptsRef.current >= maxAttempts) {
          stopPhotoPolling();
        }
      }
    };

    void tick();
    photoPollIntervalRef.current = setInterval(() => void tick(), intervalMs);
  }, [fetchPhotosFromServer, stopPhotoPolling]);

  /** Fixed-length deps: [parentId, modeParam, router, fetchPhotosFromServer] — never add/remove slots. */
  useEffect(() => {
    const p = getParentFromSession();
    if (!p) {
      router.replace("/");
      return;
    }
    void fetchPhotosFromServer().catch(() => {
      setSavedPhotoUrl(null);
      setCartoonPhotoUrl(null);
    });

    getChildProfile(p.id)
      .then((response) => {
        if (response.child) {
          setChildName(response.child.childName);
          setAge(response.child.age != null ? String(response.child.age) : "");
        } else {
          setChildName(p.childName?.trim() ?? "");
          setAge(p.childAge != null ? String(p.childAge) : "");
        }
      })
      .catch(() => {
        setChildName(p.childName?.trim() ?? "");
        setAge(p.childAge != null ? String(p.childAge) : "");
      });
  }, [parentId, modeParam, router, fetchPhotosFromServer]);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  useEffect(() => {
    return () => stopPhotoPolling();
  }, [stopPhotoPolling]);

  /** Refetch when returning to the tab (e.g. after visiting menu in another tab). */
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void fetchPhotosFromServer().catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [fetchPhotosFromServer]);

  useEffect(() => {
    if (step !== "camera") return;
    if (!videoRef.current || !streamRef.current) return;

    videoRef.current.srcObject = streamRef.current;
    void videoRef.current.play().catch(() => {
      setError("Camera started but video feed could not play. Please retry.");
    });
  }, [step]);

  /** Saves child name + age to backend (users.json + children.json). */
  async function pushChildProfileToBackend(): Promise<boolean> {
    if (!parent) return false;
    const trimmed = childName.trim();
    if (!trimmed) {
      setError("Please enter the child's name.");
      return false;
    }
    setError("");
    try {
      const ageNum = age.trim() === "" ? undefined : Number(age);
      const safeAge = ageNum !== undefined && Number.isFinite(ageNum) ? ageNum : undefined;
      const response = await createChildProfile({
        parentId: parent.id,
        childName: trimmed,
        age: safeAge
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
      return true;
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not save profile");
      return false;
    }
  }

  async function saveNameAndAgeClick() {
    setSavingProfile(true);
    try {
      await pushChildProfileToBackend();
    } finally {
      setSavingProfile(false);
    }
  }

  async function startCamera() {
    setError("");
    const trimmed = childName.trim();
    if (!trimmed) {
      setError("Please enter the child's name first.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      });
      streamRef.current = stream;
      setStep("camera");
    } catch {
      setError("Could not access webcam. Please allow camera permissions and retry.");
    }
  }

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }

  function takePhoto() {
    const video = videoRef.current;
    if (!video) return;

    const rawWidth = video.videoWidth || 640;
    const rawHeight = video.videoHeight || 480;
    const maxWidth = 960;
    const scale = rawWidth > maxWidth ? maxWidth / rawWidth : 1;
    const targetWidth = Math.round(rawWidth * scale);
    const targetHeight = Math.round(rawHeight * scale);

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const context = canvas.getContext("2d");
    if (!context) return;

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageDataUrl = canvas.toDataURL("image/jpeg", 0.82);
    setCapturedPhoto(imageDataUrl);
    stopCamera();
    setStep("preview");
  }

  async function confirmPhoto() {
    if (!capturedPhoto || !parent) return;
    setSaving(true);
    setError("");
    try {
      const response = await saveProfilePhoto(parent.id, capturedPhoto);
      setSavedPhotoUrl(response.photoUrl);
      setCartoonPhotoUrl(response.cartoonPhotoUrl ?? null);
      const profileOk = await pushChildProfileToBackend();
      if (!profileOk) return;
      setStep("done");
      setCapturedPhoto(null);
      startPhotoPollingForCartoon();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save photo");
    } finally {
      setSaving(false);
    }
  }

  const originalSrc = resolveBackendAssetUrl(savedPhotoUrl);
  const cartoonSrc = resolveBackendAssetUrl(cartoonPhotoUrl);

  return (
    <main className="kidPageShell kidPageShell--center">
      <div className="kidFloatShape kidFloat1" aria-hidden />
      <div className="kidFloatShape kidFloat2" aria-hidden />
      <div className="kidFloatShape kidFloat3" aria-hidden />

      <section className="kidCard kidCard--wide profilePanel">
        <h1 className="title">{isEdit ? "Edit profile" : "New selfie"}</h1>
        <p className="subtitle">
          {isEdit
            ? "Update your reader’s name and age, see your photos, or take a new selfie."
            : "Add your reader’s name and age, then take a selfie for the story."}
        </p>

        {(step === "intro" || step === "done") && (
          <div className="profileIntro">
            <div className="profileFieldsGrid">
              <label className="authLabel" htmlFor="profile-child-name">
                Child&apos;s name
              </label>
              <input
                id="profile-child-name"
                className="input"
                placeholder="e.g. Sam"
                value={childName}
                onChange={(e) => setChildName(e.target.value)}
                required
                autoComplete="nickname"
              />
              <label className="authLabel" htmlFor="profile-child-age">
                Age{" "}
                <span style={{ fontWeight: 600, textTransform: "none", letterSpacing: "normal" }}>
                  (optional)
                </span>
              </label>
              <input
                id="profile-child-age"
                className="input"
                placeholder="e.g. 7"
                type="number"
                inputMode="numeric"
                min={1}
                max={18}
                value={age}
                onChange={(e) => setAge(e.target.value)}
              />
            </div>

            {isEdit && (
              <>
                <div className="profileButtonRow">
                  <button
                    type="button"
                    className="menuButton secondaryButton"
                    disabled={savingProfile}
                    onClick={() => void saveNameAndAgeClick()}
                  >
                    {savingProfile ? "Saving…" : "Save name & age"}
                  </button>
                  <button type="button" className="menuButton secondaryButton" onClick={refreshPhotos}>
                    Refresh photos
                  </button>
                </div>

                <div className="profileDualGallery">
                  <div className="profileDualCard">
                    <p className="profileDualLabel">Original photo</p>
                    {originalSrc ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        className="profileDualImg"
                        src={`${originalSrc}?t=${photoCacheBust}`}
                        alt="Original profile"
                      />
                    ) : (
                      <div className="profileDualPlaceholder">No selfie yet — use “Take picture”.</div>
                    )}
                  </div>
                  <div className="profileDualCard">
                    <p className="profileDualLabel">Cartoon version</p>
                    {cartoonSrc ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        className="profileDualImg"
                        src={`${cartoonSrc}?t=${photoCacheBust}`}
                        alt="Cartoon avatar"
                      />
                    ) : (
                      <div className="profileDualPlaceholder">
                        {awaitingCartoon && originalSrc
                          ? "Drawing your cartoon… this updates automatically."
                          : originalSrc
                            ? "Cartoon is still cooking… tap “Refresh photos” if it’s slow."
                            : "Shows here after you save a selfie (Gemini + cartoon)."}
                      </div>
                    )}
                  </div>
                </div>

                <div className="profileButtonRow">
                  <button type="button" className="menuButton" onClick={() => void startCamera()}>
                    Take picture
                  </button>
                  <button type="button" className="menuButton secondaryButton" onClick={() => router.push("/menu")}>
                    Back to menu
                  </button>
                </div>
              </>
            )}

            {!isEdit && (
              <div className="profileButtonRow">
                <button type="button" className="menuButton" onClick={() => void startCamera()}>
                  Take picture
                </button>
                <button type="button" className="menuButton secondaryButton" onClick={() => router.push("/menu")}>
                  Back to menu
                </button>
              </div>
            )}

            {step === "done" && !isEdit && (
              <p className="subtitle" style={{ marginTop: 12 }}>
                Saved! Open <strong>Edit profile</strong> anytime — photos refresh automatically when the cartoon is
                ready.
              </p>
            )}
          </div>
        )}

        {step === "camera" && (
          <div className="cameraStage">
            <div className="cameraFrameWrap">
              <video ref={videoRef} className="cameraVideo" playsInline muted />
              <div className="cameraGuideRect" />
            </div>
            <div className="profileButtonRow">
              <button type="button" className="menuButton" onClick={takePhoto}>
                Take Photo
              </button>
              <button
                type="button"
                className="menuButton secondaryButton"
                onClick={() => {
                  stopCamera();
                  setStep("intro");
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {step === "preview" && capturedPhoto && (
          <div className="profilePreview">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="profilePreviewImage" src={capturedPhoto} alt="Captured selfie" />
            <p className="subtitle">Happy with this? We’ll save your photo and name/age.</p>
            <div className="profileButtonRow">
              <button
                type="button"
                className="menuButton secondaryButton"
                onClick={() => {
                  setCapturedPhoto(null);
                  void startCamera();
                }}
              >
                Retry
              </button>
              <button type="button" className="menuButton" onClick={() => void confirmPhoto()} disabled={saving}>
                {saving ? "Saving…" : "Save photo"}
              </button>
            </div>
          </div>
        )}

        {error ? (
          <p className="authError" style={{ marginTop: 10 }}>
            {error}
          </p>
        ) : null}
      </section>
    </main>
  );
}
