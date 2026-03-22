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

/** Edit flow */
type EditStep = "intro" | "camera" | "preview" | "done";
/** New setup: child's name + age, then briefing → camera → preview */
type CreateStep = "childDetails" | "preCameraBriefing" | "camera" | "preview";

export default function ProfilePhotoPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const modeParam = searchParams.get("mode") || "create";
  const isEdit = modeParam === "edit";

  const [editStep, setEditStep] = useState<EditStep>("intro");
  const [createStep, setCreateStep] = useState<CreateStep>("childDetails");
  const [pageReady, setPageReady] = useState(false);
  const [error, setError] = useState("");
  const [childName, setChildName] = useState("");
  const [age, setAge] = useState("");
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [savedPhotoUrl, setSavedPhotoUrl] = useState<string | null>(null);
  const [cartoonPhotoUrl, setCartoonPhotoUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [photoCacheBust, setPhotoCacheBust] = useState(0);
  const [awaitingCartoon, setAwaitingCartoon] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const photoPollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const photoPollAttemptsRef = useRef(0);
  const parent = getParentFromSession();
  const parentId = parent?.id ?? "";

  const cameraStepActive =
    (isEdit && editStep === "camera") || (!isEdit && createStep === "camera");
  const previewStepActive =
    (isEdit && editStep === "preview") || (!isEdit && createStep === "preview");

  function goToCameraStep() {
    if (isEdit) setEditStep("camera");
    else setCreateStep("camera");
  }

  function goToPreviewStep() {
    if (isEdit) setEditStep("preview");
    else setCreateStep("preview");
  }

  useEffect(() => {
    setEditStep("intro");
    setCreateStep("childDetails");
    setCapturedPhoto(null);
    setError("");
    setPageReady(false);
  }, [isEdit]);

  const stopPhotoPolling = useCallback(() => {
    if (photoPollIntervalRef.current) {
      clearInterval(photoPollIntervalRef.current);
      photoPollIntervalRef.current = null;
    }
    photoPollAttemptsRef.current = 0;
    setAwaitingCartoon(false);
  }, []);

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

  useEffect(() => {
    let cancelled = false;
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
        if (cancelled) return;
        if (response.child) {
          setChildName(response.child.childName);
          setAge(response.child.age != null ? String(response.child.age) : "");
        } else {
          setChildName(p.childName?.trim() ?? "");
          setAge(p.childAge != null ? String(p.childAge) : "");
        }
        setPageReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setChildName(p.childName?.trim() ?? "");
        setAge(p.childAge != null ? String(p.childAge) : "");
        setPageReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [parentId, modeParam, router, fetchPhotosFromServer, isEdit]);

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
    if (!cameraStepActive) return;
    if (!videoRef.current || !streamRef.current) return;

    videoRef.current.srcObject = streamRef.current;
    void videoRef.current.play().catch(() => {
      setError("Camera started but video feed could not play. Please retry.");
    });
  }, [cameraStepActive]);

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

  const createDetailsValid =
    childName.trim().length > 0 &&
    (age.trim() === "" ||
      (Number.isFinite(Number(age)) && Number(age) >= 1 && Number(age) <= 18));

  function proceedFromChildDetails() {
    setError("");
    if (!createDetailsValid) {
      setError("Please enter your child’s name. If you add an age, use 1–18.");
      return;
    }
    setCreateStep("preCameraBriefing");
  }

  async function startCamera() {
    setError("");
    if (isEdit) {
      const trimmed = childName.trim();
      if (!trimmed) {
        setError("Please enter the child's name first.");
        return;
      }
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      });
      streamRef.current = stream;
      goToCameraStep();
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

  function cancelCamera() {
    stopCamera();
    if (isEdit) {
      setEditStep("intro");
    } else {
      setCreateStep("preCameraBriefing");
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
    goToPreviewStep();
  }

  async function confirmPhotoAndFinish() {
    if (!capturedPhoto || !parent) return;
    setSaving(true);
    setError("");
    try {
      const profileOk = await pushChildProfileToBackend();
      if (!profileOk) return;
      const ageNum = age.trim() === "" ? null : Number(age);
      const response = await saveProfilePhoto(parent.id, capturedPhoto, {
        childName: childName.trim(),
        age: ageNum != null && Number.isFinite(ageNum) ? ageNum : undefined
      });
      setSavedPhotoUrl(response.photoUrl);
      setCartoonPhotoUrl(response.cartoonPhotoUrl ?? null);
      setCapturedPhoto(null);
      startPhotoPollingForCartoon();
      if (isEdit) {
        setEditStep("done");
      } else {
        router.push("/menu");
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save photo");
    } finally {
      setSaving(false);
    }
  }

  const originalSrc = resolveBackendAssetUrl(savedPhotoUrl);
  const cartoonSrc = resolveBackendAssetUrl(cartoonPhotoUrl);

  let cartoonPlaceholder = "Shows here after you save a selfie (Gemini + cartoon).";
  if (awaitingCartoon && originalSrc) {
    cartoonPlaceholder = "Drawing your cartoon… this updates automatically.";
  } else if (originalSrc) {
    cartoonPlaceholder = "Cartoon is still cooking… tap “Refresh photos” if it’s slow.";
  }

  let previewConfirmLabel = "Finish & go to menu";
  if (saving) previewConfirmLabel = "Saving…";
  else if (isEdit) previewConfirmLabel = "Save photo";

  const pageTitle = (() => {
    if (isEdit) {
      if (editStep === "camera") return "Take a selfie";
      if (editStep === "preview") return "Review photo";
      return "Edit child profile";
    }
    switch (createStep) {
      case "childDetails":
        return "Child profile & selfie";
      case "preCameraBriefing":
        return "Before we open the camera";
      case "camera":
        return "Take a selfie";
      case "preview":
        return "Review photo";
      default:
        return "New selfie";
    }
  })();

  if (!pageReady) {
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

  return (
    <main className="kidPageShell kidPageShell--center">
      <div className="kidFloatShape kidFloat1" aria-hidden />
      <div className="kidFloatShape kidFloat2" aria-hidden />
      <div className="kidFloatShape kidFloat3" aria-hidden />

      <section className="kidCard kidCard--wide profilePanel">
        <h1 className="title">{pageTitle}</h1>

        {!isEdit && createStep === "childDetails" ? (
          <p className="subtitle">
            Add your child&apos;s name and age, then we&apos;ll guide you through the selfie for the
            magic book.
          </p>
        ) : null}
        {!isEdit && createStep === "preCameraBriefing" ? (
          <p className="subtitle">Quick tips so the photo looks great in your book.</p>
        ) : null}

        {isEdit ? (
          <p className="subtitle">
            Update your child&apos;s name and age, see their photos, or take a new selfie.
          </p>
        ) : null}

        {/* ——— Create: child name + age (same flow as selfie) ——— */}
        {!isEdit && createStep === "childDetails" ? (
          <div className="profileIntro">
            <div className="profileFieldsGrid">
              <label className="authLabel" htmlFor="profile-child-name-create">
                Child&apos;s name
              </label>
              <input
                id="profile-child-name-create"
                className="input"
                placeholder="e.g. Sam"
                value={childName}
                onChange={(e) => setChildName(e.target.value)}
                required
                autoComplete="nickname"
              />
              <label className="authLabel" htmlFor="profile-child-age-create">
                Age{" "}
                <span style={{ fontWeight: 600, textTransform: "none", letterSpacing: "normal" }}>
                  (optional)
                </span>
              </label>
              <input
                id="profile-child-age-create"
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
            <div className="profileButtonRow profileButtonRow--spaced">
              <button
                type="button"
                className="menuButton secondaryButton"
                onClick={() => router.push("/menu")}
              >
                Cancel
              </button>
              <button
                type="button"
                className="menuButton"
                disabled={!createDetailsValid}
                onClick={proceedFromChildDetails}
              >
                Proceed
              </button>
            </div>
          </div>
        ) : null}

        {/* ——— Create: pre-camera briefing ——— */}
        {!isEdit && createStep === "preCameraBriefing" ? (
          <div className="profileBriefing">
            <div className="profileBriefingCard">
              <p className="profileBriefingLead">
                You&apos;re about to take a <strong>selfie of your child</strong>.
              </p>
              <ul className="profileBriefingList">
                <li>Ask them to sit or stand comfortably.</li>
                <li>
                  Try to keep their <strong>face centered</strong> in the frame with good light.
                </li>
                <li>Hold the device steady — we&apos;ll use this in the magic book!</li>
              </ul>
              <p className="profileBriefingQuestion">Did you understand these instructions?</p>
            </div>
            <div className="profileButtonRow profileButtonRow--spaced">
              <button
                type="button"
                className="menuButton secondaryButton"
                onClick={() => setCreateStep("childDetails")}
              >
                Back
              </button>
              <button type="button" className="menuButton" onClick={() => void startCamera()}>
                I understood — open camera
              </button>
            </div>
          </div>
        ) : null}

        {/* ——— Edit: intro + gallery ——— */}
        {isEdit && (editStep === "intro" || editStep === "done") ? (
          <div className="profileIntro">
            <div className="profileFieldsGrid">
              <label className="authLabel" htmlFor="profile-child-name-edit">
                Child&apos;s name
              </label>
              <input
                id="profile-child-name-edit"
                className="input"
                placeholder="e.g. Sam"
                value={childName}
                onChange={(e) => setChildName(e.target.value)}
                required
                autoComplete="nickname"
              />
              <label className="authLabel" htmlFor="profile-child-age-edit">
                Age{" "}
                <span style={{ fontWeight: 600, textTransform: "none", letterSpacing: "normal" }}>
                  (optional)
                </span>
              </label>
              <input
                id="profile-child-age-edit"
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
                  <div className="profileDualPlaceholder">{cartoonPlaceholder}</div>
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

            {editStep === "done" ? (
              <p className="subtitle" style={{ marginTop: 12 }}>
                Saved! Your photos will update when the cartoon is ready.
              </p>
            ) : null}
          </div>
        ) : null}

        {/* ——— Camera (shared) ——— */}
        {cameraStepActive ? (
          <div className="cameraStage">
            <div className="cameraFrameWrap">
              <video ref={videoRef} className="cameraVideo" playsInline muted />
              <div className="cameraGuideRect" />
            </div>
            <div className="profileButtonRow">
              <button type="button" className="menuButton" onClick={takePhoto}>
                Take Photo
              </button>
              <button type="button" className="menuButton secondaryButton" onClick={cancelCamera}>
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        {/* ——— Preview (shared) ——— */}
        {previewStepActive && capturedPhoto ? (
          <div className="profilePreview">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="profilePreviewImage" src={capturedPhoto} alt="Captured selfie" />
            <p className="subtitle">
              {isEdit
                ? "Happy with this? We’ll save your photo and name/age."
                : "Retake if you like, or finish to save and go to your story menu."}
            </p>
            <div className="profileButtonRow">
              <button
                type="button"
                className="menuButton secondaryButton"
                onClick={() => {
                  setCapturedPhoto(null);
                  void startCamera();
                }}
              >
                Retake
              </button>
              <button
                type="button"
                className="menuButton"
                onClick={() => void confirmPhotoAndFinish()}
                disabled={saving}
              >
                {previewConfirmLabel}
              </button>
            </div>
          </div>
        ) : null}

        {error ? (
          <p className="authError" style={{ marginTop: 10 }}>
            {error}
          </p>
        ) : null}
      </section>
    </main>
  );
}
