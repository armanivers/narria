"use client";

import { useEffect, useRef, useState } from "react";
import {
  NARRIA_EXTERNAL_TOAST_EVENT,
  type NarriaExternalService,
  type NarriaExternalToastDetail
} from "@/lib/externalApiToastEvents";

const LABELS: Record<NarriaExternalService, string> = {
  gemini: "Google Gemini",
  elevenlabs: "ElevenLabs",
  n8n: "n8n webhook"
};

/** Short flash (~2s) so the line is readable without cluttering the UI. */
const TOAST_MS = 2000;

export function ExternalApiToastHost() {
  const [visible, setVisible] = useState(false);
  const [detail, setDetail] = useState<NarriaExternalToastDetail | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function onToast(ev: Event) {
      const ce = ev as CustomEvent<NarriaExternalToastDetail>;
      const d = ce.detail;
      if (!d?.service) return;
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      setDetail(d);
      setVisible(true);
      hideTimerRef.current = setTimeout(() => {
        setVisible(false);
        hideTimerRef.current = null;
      }, TOAST_MS);
    }
    window.addEventListener(NARRIA_EXTERNAL_TOAST_EVENT, onToast);
    return () => {
      window.removeEventListener(NARRIA_EXTERNAL_TOAST_EVENT, onToast);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  if (!visible || !detail) return null;

  const title = LABELS[detail.service] ?? "External service";
  const body = (detail.message || "Something went wrong. Check server configuration or API keys.").trim();

  return (
    <div className="narriaExternalToast" role="status" aria-live="polite">
      <p className="narriaExternalToast__title">{title}</p>
      <p className="narriaExternalToast__body">{body}</p>
    </div>
  );
}
