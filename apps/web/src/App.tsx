import { useEffect, useRef, useState } from "react";
import { Check, Clipboard, ImagePlus, Loader2, Upload, XCircle } from "lucide-react";
import type {
  ApiErrorResponse,
  ReserveUploadRequest,
  ReserveUploadResponse,
  UploadCompleteResponse
} from "@screenshot/shared";
import { MAX_UPLOAD_BYTES } from "@screenshot/shared";
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
};

const SUPPORTED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export function App() {
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
    const timer = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function startUpload(file: File) {
    activeXhrRef.current?.abort();

    if (!SUPPORTED_TYPES.has(file.type)) {
      showError(file, "Only PNG, JPEG, and WebP images are supported.");
      return;
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      showError(file, "Image is larger than 25 MB.");
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setUpload({
      file,
      previewUrl,
      assetUrl: "",
      progress: 0,
      state: "reserved",
      error: null
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
              state: "complete"
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
      error
    });
    setToast(error);
  }

  async function copyToClipboard(text: string) {
    await navigator.clipboard.writeText(text);
  }

  const statusTitle = upload ? titleForState(upload.state) : "Paste a screenshot";
  const statusText = upload ? detailForUpload(upload) : "Paste, drop an image, or click the icon.";

  return (
    <main className="shell">
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
              <p>{statusText}</p>
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
              <div className="url-row">
                <input readOnly value={upload.assetUrl} aria-label="Copied asset URL" />
                <Button
                  variant="secondary"
                  aria-label="Copy link"
                  onClick={() => {
                    void copyToClipboard(upload.assetUrl).then(() => setToast("Link copied"));
                  }}
                >
                  <Clipboard size={16} />
                </Button>
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
          accept="image/png,image/jpeg,image/webp"
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
  if (upload.state === "complete") return `${formatBytes(upload.file.size)} image uploaded.`;
  if (upload.state === "error") return "The link was not created for this image.";
  if (upload.assetUrl) return "The link is already copied. Keep this tab open until the upload finishes.";
  return `${formatBytes(upload.file.size)} image selected.`;
}

function iconForState(state: UploadState) {
  if (state === "uploading" || state === "reserved") return <Loader2 className="spin" size={28} />;
  if (state === "complete") return <Check size={28} />;
  if (state === "error") return <XCircle size={28} />;
  return <ImagePlus size={28} />;
}
