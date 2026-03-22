export type NarriaExternalService = "gemini" | "elevenlabs" | "n8n";

export const NARRIA_EXTERNAL_TOAST_EVENT = "narria:external-api-toast";

export type NarriaExternalToastDetail = {
  service: NarriaExternalService;
  message?: string;
};

export function emitExternalApiToast(detail: NarriaExternalToastDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(NARRIA_EXTERNAL_TOAST_EVENT, { detail }));
}
