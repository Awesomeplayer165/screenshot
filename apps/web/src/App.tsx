import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Clipboard, ExternalLink, ImagePlus, Loader2, Settings, Upload, XCircle } from "lucide-react";
import type {
  ApiErrorResponse,
  ReserveUploadRequest,
  ReserveUploadResponse,
  UploadCompleteResponse
} from "@screenshot/shared";
import { AdminDashboard } from "./AdminDashboard";
import { Button } from "./components/Button";
import { Progress } from "./components/Progress";
import { Toast } from "./components/Toast";
import { formatBytes } from "./lib/utils";

type UploadState = "idle" | "reserved" | "uploading" | "complete" | "error";

type CurrentUpload = {
  file: File;
  previewUrl: string;
  assetUrl: string;
  progress: number;
  state: UploadState;
  error: string | null;
  originalSizeBytes: number | null;
  uploadedSizeBytes: number | null;
};

const SUPPORTED_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/heic", "image/heif"]);

export function App() {
  if (window.location.pathname.startsWith("/admin")) return <AdminDashboard />;
  return <UploadPage />;
}

function UploadPage() {
  const [upload, setUpload] = useState<CurrentUpload | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeXhrRef = useRef<XMLHttpRequest | null>(null);

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const file = imageFromClipboard(event);
      if (!file) return;
      event.preventDefault();
      void startUpload(file);
    };

    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function startUpload(file: File) {
    activeXhrRef.current?.abort();

    if (!SUPPORTED_TYPES.has(file.type)) {
      showError(file, "Only PNG, JPEG, WebP, HEIC, and HEIF images are supported.");
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setUpload({
      file,
      previewUrl,
      assetUrl: "",
      progress: 0,
      state: "reserved",
      error: null,
      originalSizeBytes: null,
      uploadedSizeBytes: null
    });

    try {
      const reserved = await reserveUpload(file.type);
      try {
        await copyToClipboard(reserved.assetUrl);
        setToast("Link copied");
      } catch {
        setToast("Link ready");
      }

      setUpload((current) =>
        current
          ? {
              ...current,
              assetUrl: reserved.assetUrl,
              state: "uploading"
            }
          : current
      );

      const completed = await uploadFile(
        reserved.uploadUrl,
        file,
        (xhr) => {
          activeXhrRef.current = xhr;
        },
        (progress) => {
          setUpload((current) => (current ? { ...current, progress } : current));
        }
      );

      setUpload((current) =>
        current
          ? {
              ...current,
              assetUrl: completed.assetUrl,
              progress: 100,
              state: "complete",
              originalSizeBytes: completed.originalSizeBytes,
              uploadedSizeBytes: completed.sizeBytes
            }
          : current
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed.";
      setUpload((current) =>
        current
          ? {
              ...current,
              state: "error",
              error: message
            }
          : current
      );
      setToast(message);
    }
  }

  function showError(file: File, error: string) {
    setUpload({
      file,
      previewUrl: URL.createObjectURL(file),
      assetUrl: "",
      progress: 0,
      state: "error",
      error,
      originalSizeBytes: file.size,
      uploadedSizeBytes: null
    });
    setToast(error);
  }

  async function copyToClipboard(text: string) {
    await navigator.clipboard.writeText(text);
  }

  const statusTitle = upload ? titleForState(upload.state) : "Paste a screenshot";
  const statusText = upload ? detailForUpload(upload) : "Paste, drop an image, or click below to select.";

  return (
    <main className="shell">
      <div className="ambient-background" aria-hidden="true" />
      <Button className="admin-entry icon-button" variant="secondary" aria-label="Admin dashboard" onClick={() => (window.location.href = "/admin")}>
        <Settings size={16} />
      </Button>
      <section className="hero">
        <div
          className={`upload-panel ${dragActive ? "is-dragging" : ""} ${upload?.state === "complete" ? "is-complete" : ""}`}
          tabIndex={0}
          onDragEnter={(event) => {
            event.preventDefault();
            setDragActive(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={() => setDragActive(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragActive(false);
            const file = imageFromFileList(event.dataTransfer.files);
            if (file) void startUpload(file);
          }}
          onClick={(event) => {
            const target = event.target as HTMLElement;
            if (target.closest("button, input")) return;
            if (upload?.state === "reserved" || upload?.state === "uploading") return;
            fileInputRef.current?.click();
          }}
        >
          <div className="panel-glow" />
          <div className="upload-content">
            <button
              className="upload-icon"
              type="button"
              aria-label="Choose image"
              disabled={upload?.state === "reserved" || upload?.state === "uploading"}
              onClick={() => fileInputRef.current?.click()}
            >
              {iconForState(upload?.state ?? "idle")}
            </button>

            <div className="copy">
              <h1>{statusTitle}</h1>
              {upload?.state === "complete" ? <UploadSizeSummary upload={upload} /> : <p>{statusText}</p>}
            </div>

            {upload?.previewUrl ? (
              <img className="preview" src={upload.previewUrl} alt="" />
            ) : (
              <div className="empty-preview" aria-hidden="true" />
            )}

            {upload?.state === "uploading" || upload?.state === "reserved" ? (
              <div className="progress-wrap">
                <Progress value={upload.progress} />
                <span>{Math.round(upload.progress)}%</span>
              </div>
            ) : null}

            {upload?.assetUrl ? (
              <div className={`url-row ${upload.state === "complete" ? "has-open-action" : ""}`}>
                <input readOnly value={upload.assetUrl} aria-label="Copied asset URL" />
                <Button
                  className="icon-button"
                  variant="secondary"
                  aria-label="Copy link"
                  onClick={() => {
                    void copyToClipboard(upload.assetUrl).then(() => setToast("Link copied"));
                  }}
                >
                  <Clipboard size={16} />
                </Button>
                {upload.state === "complete" ? (
                  <Button
                    className="icon-button"
                    variant="secondary"
                    aria-label="Open image in new page"
                    onClick={() => window.open(upload.assetUrl, "_blank", "noopener,noreferrer")}
                  >
                    <ExternalLink size={16} />
                  </Button>
                ) : null}
              </div>
            ) : null}

            {upload?.state === "error" && upload.error ? <div className="error-text">{upload.error}</div> : null}

            {upload?.state === "error" ? (
              <div className="actions">
                <Button onClick={() => void startUpload(upload.file)}>
                  <Upload size={16} />
                  Retry
                </Button>
              </div>
            ) : null}
          </div>
        </div>

        <input
          ref={fileInputRef}
          className="file-input"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/heic,image/heif"
          onChange={(event) => {
            const file = imageFromFileList(event.currentTarget.files);
            event.currentTarget.value = "";
            if (file) void startUpload(file);
          }}
        />
      </section>

      <Toast message={toast} />
    </main>
  );
}

function imageFromClipboard(event: ClipboardEvent): File | null {
  const items = Array.from(event.clipboardData?.items ?? []);
  const item = items.find((entry) => entry.kind === "file" && SUPPORTED_TYPES.has(entry.type));
  const file = item?.getAsFile();
  return file ? withFallbackName(file) : null;
}

function imageFromFileList(files: FileList | null): File | null {
  const file = Array.from(files ?? []).find((entry) => SUPPORTED_TYPES.has(entry.type));
  return file ? withFallbackName(file) : null;
}

function withFallbackName(file: File): File {
  if (file.name) return file;
  return new File([file], "screenshot.png", { type: file.type });
}

async function reserveUpload(mimeType: string): Promise<ReserveUploadResponse> {
  const body: ReserveUploadRequest = { mimeType: mimeType as ReserveUploadRequest["mimeType"] };
  const response = await fetch("/api/uploads", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(await errorFromResponse(response));
  return response.json() as Promise<ReserveUploadResponse>;
}

function uploadFile(
  uploadUrl: string,
  file: File,
  onXhr: (xhr: XMLHttpRequest) => void,
  onProgress: (progress: number) => void
): Promise<UploadCompleteResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.responseType = "json";

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      onProgress((event.loaded / event.total) * 100);
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.response as UploadCompleteResponse);
        return;
      }

      const fallback = xhr.status === 413 ? "Image is larger than 25 MB." : "Upload failed.";
      const response = xhr.response as ApiErrorResponse | null;
      reject(new Error(response?.error ?? fallback));
    };

    xhr.onerror = () => reject(new Error("Network error while uploading."));
    xhr.onabort = () => reject(new Error("Upload cancelled."));
    onXhr(xhr);
    xhr.send(file);
  });
}

async function errorFromResponse(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as ApiErrorResponse;
    return payload.error;
  } catch {
    return "Request failed.";
  }
}

function titleForState(state: UploadState): string {
  if (state === "reserved") return "Preparing link";
  if (state === "uploading") return "Uploading";
  if (state === "complete") return "Ready";
  if (state === "error") return "Could not upload";
  return "Paste a screenshot";
}

function detailForUpload(upload: CurrentUpload): string {
  if (upload.state === "complete") return "Image uploaded.";
  if (upload.state === "error") return "The link was not created for this image.";
  if (upload.assetUrl) return "The link is already copied.";
  return `${formatBytes(upload.file.size)} image selected.`;
}

function UploadSizeSummary({ upload }: { upload: CurrentUpload }) {
  const original = upload.originalSizeBytes ?? upload.file.size;
  const uploaded = upload.uploadedSizeBytes ?? original;

  if (original === uploaded) {
    return <p>Image uploaded. {formatBytes(uploaded)}.</p>;
  }

  return (
    <p className="size-summary">
      <span>Image uploaded.</span>
      <strong>{formatBytes(original)}</strong>
      <ArrowRight size={15} />
      <strong>{formatBytes(uploaded)}</strong>
    </p>
  );
}

function iconForState(state: UploadState) {
  if (state === "uploading" || state === "reserved") return <Loader2 className="spin" size={28} />;
  if (state === "complete") return <Check size={28} />;
  if (state === "error") return <XCircle size={28} />;
  return <ImagePlus size={28} />;
}
