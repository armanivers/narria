"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getProfilePhoto, saveProfilePhoto } from "@/lib/api";
import { getParentFromSession } from "@/lib/session";

type FlowStep = "intro" | "camera" | "preview" | "done";

export default function ProfilePhotoPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode = useMemo(() => searchParams.get("mode") || "create", [searchParams]);

  const [step, setStep] = useState<FlowStep>("intro");
  const [error, setError] = useState("");
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [savedPhotoUrl, setSavedPhotoUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const parent = getParentFromSession();

  useEffect(() => {
    if (!parent) {
      router.replace("/");
      return;
    }
    getProfilePhoto(parent.id)
      .then((response) => setSavedPhotoUrl(response.photoUrl))
      .catch(() => {
        // Do not block webcam flow if backend read fails.
        setSavedPhotoUrl(null);
      });
  }, [parent, router]);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  useEffect(() => {
    if (step !== "camera") return;
    if (!videoRef.current || !streamRef.current) return;

    videoRef.current.srcObject = streamRef.current;
    void videoRef.current.play().catch(() => {
      setError("Camera started but video feed could not play. Please retry.");
    });
  }, [step]);

  async function startCamera() {
    setError("");
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
      setStep("done");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save photo");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="screen">
      <section className="panel profilePanel">
        <h1 className="title">{mode === "edit" ? "Edit Profile Photo" : "Create Profile Photo"}</h1>

        {(step === "intro" || step === "done") && (
          <div className="profileIntro">
            <p className="subtitle">
              Please take a selfie in order to prepare your personalized story version of yourself.
            </p>
            {savedPhotoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="profileSavedPhoto" src={`${savedPhotoUrl}?t=${Date.now()}`} alt="Saved profile" />
            ) : null}
            <div style={{ display: "flex", gap: 8 }}>
              <button className="menuButton" onClick={startCamera}>
                {mode === "edit" ? "Retake Photo" : "Start Camera"}
              </button>
              <button className="menuButton secondaryButton" onClick={() => router.push("/menu")}>
                Back to Menu
              </button>
            </div>
          </div>
        )}

        {step === "camera" && (
          <div className="cameraStage">
            <div className="cameraFrameWrap">
              <video ref={videoRef} className="cameraVideo" playsInline muted />
              <div className="cameraGuideRect" />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="menuButton" onClick={takePhoto}>
                Take Photo
              </button>
              <button
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
            <p className="subtitle">Retry if needed or continue if you are happy with this photo.</p>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="menuButton secondaryButton"
                onClick={() => {
                  setCapturedPhoto(null);
                  startCamera();
                }}
              >
                Retry
              </button>
              <button className="menuButton" onClick={confirmPhoto} disabled={saving}>
                {saving ? "Saving..." : "Continue"}
              </button>
            </div>
          </div>
        )}

        {error ? <p style={{ color: "#ffbaba", marginTop: 10 }}>{error}</p> : null}
      </section>
    </main>
  );
}
