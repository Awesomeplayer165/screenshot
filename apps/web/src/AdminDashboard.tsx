import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Clipboard, ExternalLink, LogOut, RefreshCw, Save, Settings, Trash2 } from "lucide-react";
import type { AdminSummary, AdminUpload, AppSettings, ApiErrorResponse } from "@screenshot/shared";
import { Button } from "./components/Button";
import { Toast } from "./components/Toast";
import { formatBytes } from "./lib/utils";

type LoadState = "loading" | "ready" | "unauthorized" | "disabled" | "error";

export function AdminDashboard() {
  const [state, setState] = useState<LoadState>("loading");
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [settings, setSettings] = useState<(AppSettings & { oidcClientSecret?: string }) | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    void loadSummary();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function loadSummary() {
    setState("loading");
    const response = await fetch("/api/admin/summary");

    if (response.status === 401) {
      setState("unauthorized");
      return;
    }

    if (response.status === 404) {
      setState("disabled");
      return;
    }

    if (!response.ok) {
      setState("error");
      return;
    }

    const data = (await response.json()) as AdminSummary;
    setSummary(data);
    setSettings({ ...data.settings, oidcClientSecret: "" });
    setState("ready");
  }

  async function saveSettings() {
    if (!settings) return;
    const response = await fetch("/api/admin/settings", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(settings)
    });

    if (!response.ok) {
      setToast(await errorFromResponse(response));
      return;
    }

    const payload = (await response.json()) as { settings: AppSettings };
    setSettings({ ...payload.settings, oidcClientSecret: "" });
    setSummary((current) => (current ? { ...current, settings: payload.settings } : current));
    setToast("Settings saved");
  }

  async function deleteUpload(upload: AdminUpload) {
    const response = await fetch(`/api/admin/uploads/${upload.id}`, { method: "DELETE" });
    if (!response.ok) {
      setToast(await errorFromResponse(response));
      return;
    }

    setSummary((current) =>
      current
        ? {
            ...current,
            uploads: current.uploads.filter((item) => item.id !== upload.id),
            storageBytes: current.storageBytes - (upload.sizeBytes ?? 0)
          }
        : current
    );
    setToast("Upload deleted");
  }

  if (state === "loading") {
    return <AdminShell title="Admin" subtitle="Loading dashboard." />;
  }

  if (state === "unauthorized") {
    return (
      <AdminShell title="Admin" subtitle="Sign in with your configured OIDC provider.">
        <Button onClick={() => (window.location.href = "/auth/login")}>
          <ExternalLink size={16} />
          Sign in
        </Button>
      </AdminShell>
    );
  }

  if (state === "disabled") {
    return <AdminShell title="Admin disabled" subtitle="The dashboard is disabled by configuration or persisted settings." />;
  }

  if (state === "error" || !summary || !settings) {
    return (
      <AdminShell title="Admin" subtitle="Could not load the dashboard.">
        <Button onClick={() => void loadSummary()}>
          <RefreshCw size={16} />
          Retry
        </Button>
      </AdminShell>
    );
  }

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <h1>Admin</h1>
          <p>{summary.uploads.length} uploads · {formatBytes(summary.storageBytes)} stored</p>
        </div>
        <div className="admin-header-actions">
          <Button variant="secondary" onClick={() => void loadSummary()}>
            <RefreshCw size={16} />
            Refresh
          </Button>
          <form action="/auth/logout" method="post">
            <Button variant="secondary" type="submit">
              <LogOut size={16} />
              Sign out
            </Button>
          </form>
        </div>
      </header>

      <section className="admin-grid">
        <div className="admin-card settings-card">
          <div className="card-title">
            <Settings size={18} />
            <h2>Settings</h2>
          </div>

          <div className="settings-grid">
            <div className="settings-section-title">Authentication</div>
            <Toggle
              label="Admin dashboard"
              checked={settings.adminDashboardEnabled}
              onChange={(adminDashboardEnabled) => setSettings({ ...settings, adminDashboardEnabled })}
              url={`${settings.appOrigin}/admin`}
            />
            <Toggle
              label="Upload UI"
              checked={settings.uploadAuthRequired}
              onChange={(uploadAuthRequired) => setSettings({ ...settings, uploadAuthRequired })}
              url={settings.appOrigin}
            />
            <Toggle
              label="Assets"
              checked={settings.assetsAuthRequired}
              onChange={(assetsAuthRequired) => setSettings({ ...settings, assetsAuthRequired })}
              url={settings.assetOrigin}
            />
            <div className="settings-section-title">Upload</div>
            <Toggle
              label="Image compression"
              checked={settings.imageCompressionEnabled}
              onChange={(imageCompressionEnabled) => setSettings({ ...settings, imageCompressionEnabled })}
            />
            <label className="field">
              <span>Upload limit MB</span>
              <input
                type="number"
                min="1"
                step="1"
                value={settings.maxUploadMb}
                onChange={(event) => setSettings({ ...settings, maxUploadMb: Number(event.currentTarget.value) })}
              />
            </label>
          </div>

          <div className="oidc-fields">
            <label className="field">
              <span>OIDC issuer URL</span>
              <input value={settings.oidcIssuerUrl} onChange={(event) => setSettings({ ...settings, oidcIssuerUrl: event.currentTarget.value })} />
            </label>
            <label className="field">
              <span>OIDC client ID</span>
              <input value={settings.oidcClientId} onChange={(event) => setSettings({ ...settings, oidcClientId: event.currentTarget.value })} />
            </label>
            <label className="field">
              <span>OIDC client secret</span>
              <input
                type="password"
                value={settings.oidcClientSecret ?? ""}
                placeholder="Leave blank to keep current secret"
                onChange={(event) => setSettings({ ...settings, oidcClientSecret: event.currentTarget.value })}
              />
            </label>
            <label className="field">
              <span>Redirect URI</span>
              <input value={settings.oidcRedirectUri} onChange={(event) => setSettings({ ...settings, oidcRedirectUri: event.currentTarget.value })} />
            </label>
            <label className="field">
              <span>Allowed email</span>
              <input value={settings.adminEmail} onChange={(event) => setSettings({ ...settings, adminEmail: event.currentTarget.value })} />
            </label>
          </div>

          <Button onClick={() => void saveSettings()}>
            <Save size={16} />
            Save settings
          </Button>
        </div>

        <UploadsTable uploads={summary.uploads} onDelete={(upload) => void deleteUpload(upload)} onToast={setToast} />
      </section>

      <Toast message={toast} />
    </main>
  );
}

function AdminShell({ title, subtitle, children }: { title: string; subtitle: string; children?: ReactNode }) {
  return (
    <main className="admin-shell admin-center">
      <div className="admin-card empty-admin">
        <h1>{title}</h1>
        <p>{subtitle}</p>
        {children ? <div className="actions">{children}</div> : null}
      </div>
    </main>
  );
}

function Toggle({
  label,
  checked,
  url,
  onChange
}: {
  label: string;
  checked: boolean;
  url?: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="toggle-row">
      <span>
        {label}
        {url ? <small>{url}</small> : null}
      </span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.currentTarget.checked)} />
    </label>
  );
}

function UploadsTable({
  uploads,
  onDelete,
  onToast
}: {
  uploads: AdminUpload[];
  onDelete: (upload: AdminUpload) => void;
  onToast: (message: string) => void;
}) {
  const rows = useMemo(() => uploads, [uploads]);

  return (
    <div className="admin-card uploads-card">
      <div className="card-title">
        <h2>Uploads</h2>
      </div>
      <div className="upload-table">
        {rows.map((upload) => (
          <div className="upload-row" key={upload.id}>
            <div>
              <strong>{upload.id}</strong>
              <span>{upload.mimeType ?? "reserved"} · {new Date(upload.createdAt).toLocaleString()}</span>
            </div>
            <span>{upload.sizeBytes ? formatBytes(upload.sizeBytes) : "—"}</span>
            <div className="row-actions">
              {upload.publicUrl ? (
                <>
                  <Button
                    variant="secondary"
                    aria-label="Copy public URL"
                    onClick={() => {
                      void navigator.clipboard.writeText(upload.publicUrl ?? "").then(() => onToast("Link copied"));
                    }}
                  >
                    <Clipboard size={16} />
                  </Button>
                  <Button variant="secondary" aria-label="Open public URL" onClick={() => window.open(upload.publicUrl ?? "", "_blank")}>
                    <ExternalLink size={16} />
                  </Button>
                </>
              ) : null}
              <Button variant="secondary" aria-label="Delete upload" onClick={() => onDelete(upload)}>
                <Trash2 size={16} />
              </Button>
            </div>
          </div>
        ))}
        {rows.length === 0 ? <p>No uploads yet.</p> : null}
      </div>
    </div>
  );
}

async function errorFromResponse(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as ApiErrorResponse;
    return payload.error;
  } catch {
    return "Request failed.";
  }
}
