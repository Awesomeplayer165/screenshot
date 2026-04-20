import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowUpDown, Clipboard, ExternalLink, LogOut, RefreshCw, Save, Search, Settings, Trash2 } from "lucide-react";
import type { AdminSummary, AdminUpload, AppSettings, ApiErrorResponse } from "@screenshot/shared";
import { Button } from "./components/Button";
import { Toast } from "./components/Toast";
import { formatBytes } from "./lib/utils";

type LoadState = "loading" | "ready" | "unauthorized" | "disabled" | "error";
type SortKey = "createdAt" | "id" | "status" | "mimeType" | "sizeBytes";
type SortDirection = "asc" | "desc";

export function AdminDashboard() {
  const [state, setState] = useState<LoadState>("loading");
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    void loadSummary();
  }, []);

  useEffect(() => {
    if (state !== "unauthorized") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("auth") === "callback") return;
    window.location.assign("/auth/login");
  }, [state]);

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
    setSettings(data.settings);
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
    setSettings(payload.settings);
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
    return <AdminSkeleton />;
  }

  if (state === "unauthorized") {
    return (
      <AdminShell title="Could not stay signed in" subtitle="OIDC completed, but the admin session cookie was not accepted. Check COOKIE_DOMAIN, PUBLIC_APP_ORIGIN, HTTPS, and SESSION_SECRET.">
        <Button onClick={() => (window.location.href = "/auth/login")}>
          <ExternalLink size={16} />
          Sign in again
        </Button>
      </AdminShell>
    );
  }

  if (state === "disabled") {
    return <AdminShell title="Admin disabled" subtitle="The dashboard is disabled in persisted settings." />;
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
          <Button variant="secondary" onClick={() => (window.location.href = "/")}>
            <ArrowLeft size={16} />
            Upload UI
          </Button>
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
              <span>Compression level</span>
              <select
                value={settings.imageCompressionLevel}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    imageCompressionLevel: event.currentTarget.value as AppSettings["imageCompressionLevel"]
                  })
                }
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </label>
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
            <div className="settings-section-title">Prune</div>
            <label className="field">
              <span>Keep days</span>
              <input
                type="number"
                min="0"
                step="1"
                value={settings.pruneDays}
                onChange={(event) => setSettings({ ...settings, pruneDays: Number(event.currentTarget.value) })}
              />
            </label>
            <label className="field">
              <span>Max folder GB</span>
              <input
                type="number"
                min="0"
                step="0.1"
                value={settings.pruneGb}
                onChange={(event) => setSettings({ ...settings, pruneGb: Number(event.currentTarget.value) })}
              />
            </label>
          </div>

          <div className="deployment-fields">
            <div className="settings-section-title">Deployment</div>
            <ReadOnlyField label="OIDC issuer" value={settings.oidcIssuerUrl || "Not configured"} />
            <ReadOnlyField label="OIDC client ID" value={settings.oidcClientId || "Not configured"} />
            <ReadOnlyField label="Redirect URI" value={settings.oidcRedirectUri || "Not configured"} />
            <ReadOnlyField label="Allowed email" value={settings.adminEmail || "Not configured"} />
          </div>

          <Button onClick={() => void saveSettings()}>
            <Save size={16} />
            Save settings
          </Button>
        </div>

        <UploadsTable
          uploads={summary.uploads}
          onDelete={(upload) => void deleteUpload(upload)}
          onBulkDelete={(uploads) => {
            void Promise.all(uploads.map((upload) => deleteUpload(upload)));
          }}
          onToast={setToast}
        />
      </section>

      <Toast message={toast} />
    </main>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <label className="field readonly-field">
      <span>{label}</span>
      <input readOnly value={value} />
    </label>
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
  onBulkDelete,
  onToast
}: {
  uploads: AdminUpload[];
  onDelete: (upload: AdminUpload) => void;
  onBulkDelete: (uploads: AdminUpload[]) => void;
  onToast: (message: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const typeOptions = useMemo(() => {
    const values = new Set(uploads.map((upload) => upload.mimeType ?? "unknown"));
    return ["all", ...Array.from(values).sort()];
  }, [uploads]);

  const rows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return uploads
      .filter((upload) => {
        if (statusFilter !== "all" && upload.status !== statusFilter) return false;
        if (typeFilter !== "all" && (upload.mimeType ?? "unknown") !== typeFilter) return false;
        if (!normalizedQuery) return true;
        return [upload.id, upload.mimeType, upload.publicUrl, upload.status].some((value) => value?.toLowerCase().includes(normalizedQuery));
      })
      .sort((a, b) => compareUploads(a, b, sortKey, sortDirection));
  }, [uploads, query, statusFilter, typeFilter, sortKey, sortDirection]);

  const allVisibleSelected = rows.length > 0 && rows.every((upload) => selected.has(upload.id));
  const selectedRows = rows.filter((upload) => selected.has(upload.id));

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(key);
    setSortDirection(key === "createdAt" || key === "sizeBytes" ? "desc" : "asc");
  }

  function toggleAllVisible() {
    setSelected((current) => {
      const next = new Set(current);
      if (allVisibleSelected) {
        for (const upload of rows) next.delete(upload.id);
      } else {
        for (const upload of rows) next.add(upload.id);
      }

      return next;
    });
  }

  function toggleSelected(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="admin-card uploads-card">
      <div className="card-title">
        <h2>Uploads</h2>
      </div>

      <div className="table-toolbar">
        <label className="search-field">
          <Search size={15} />
          <input value={query} placeholder="Search uploads" onChange={(event) => setQuery(event.currentTarget.value)} />
        </label>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.currentTarget.value)}>
          <option value="all">All statuses</option>
          <option value="complete">Complete</option>
          <option value="reserved">Reserved</option>
          <option value="failed">Failed</option>
        </select>
        <select value={typeFilter} onChange={(event) => setTypeFilter(event.currentTarget.value)}>
          {typeOptions.map((value) => (
            <option value={value} key={value}>
              {value === "all" ? "All types" : value}
            </option>
          ))}
        </select>
      </div>

      <div className="bulk-row">
        <label className="check-row">
          <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} />
          <span>{selectedRows.length ? `${selectedRows.length} selected` : "Select all visible"}</span>
        </label>
        <Button
          variant="secondary"
          disabled={selectedRows.length === 0}
          onClick={() => {
            onBulkDelete(selectedRows);
            setSelected(new Set());
            onToast("Selected uploads deleted");
          }}
        >
          <Trash2 size={16} />
          Delete selected
        </Button>
      </div>

      <div className="upload-table-header">
        <span />
        <SortButton label="ID" active={sortKey === "id"} direction={sortDirection} onClick={() => toggleSort("id")} />
        <SortButton label="Type" active={sortKey === "mimeType"} direction={sortDirection} onClick={() => toggleSort("mimeType")} />
        <SortButton label="Size" active={sortKey === "sizeBytes"} direction={sortDirection} onClick={() => toggleSort("sizeBytes")} />
        <SortButton label="Created" active={sortKey === "createdAt"} direction={sortDirection} onClick={() => toggleSort("createdAt")} />
        <span />
      </div>

      <div className="upload-table">
        {rows.map((upload) => (
          <div className="upload-row" key={upload.id}>
            <input type="checkbox" checked={selected.has(upload.id)} onChange={() => toggleSelected(upload.id)} />
            <div>
              <strong>{upload.id}</strong>
              <span>{upload.status}</span>
            </div>
            <span>{upload.mimeType ?? "reserved"}</span>
            <span>{upload.sizeBytes ? formatBytes(upload.sizeBytes) : "—"}</span>
            <span>{new Date(upload.createdAt).toLocaleString()}</span>
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

function SortButton({
  label,
  active,
  direction,
  onClick
}: {
  label: string;
  active: boolean;
  direction: SortDirection;
  onClick: () => void;
}) {
  return (
    <button className={`sort-button ${active ? "is-active" : ""}`} type="button" onClick={onClick}>
      {label}
      <ArrowUpDown size={13} />
      {active ? <small>{direction}</small> : null}
    </button>
  );
}

function compareUploads(a: AdminUpload, b: AdminUpload, key: SortKey, direction: SortDirection): number {
  const multiplier = direction === "asc" ? 1 : -1;
  const aValue = valueForSort(a, key);
  const bValue = valueForSort(b, key);
  if (aValue < bValue) return -1 * multiplier;
  if (aValue > bValue) return 1 * multiplier;
  return 0;
}

function valueForSort(upload: AdminUpload, key: SortKey): string | number {
  if (key === "createdAt") return Date.parse(upload.createdAt);
  if (key === "sizeBytes") return upload.sizeBytes ?? 0;
  return upload[key] ?? "";
}

function AdminSkeleton() {
  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <div className="skeleton skeleton-title" />
          <div className="skeleton skeleton-line" />
        </div>
        <div className="admin-header-actions">
          <div className="skeleton skeleton-button" />
          <div className="skeleton skeleton-button" />
          <div className="skeleton skeleton-button" />
        </div>
      </header>
      <section className="admin-grid">
        <div className="admin-card settings-card skeleton-card">
          <div className="skeleton skeleton-line wide" />
          <div className="skeleton skeleton-block" />
          <div className="skeleton skeleton-block" />
          <div className="skeleton skeleton-block" />
        </div>
        <div className="admin-card uploads-card skeleton-card">
          <div className="skeleton skeleton-line wide" />
          <div className="skeleton skeleton-block" />
          <div className="skeleton skeleton-row" />
          <div className="skeleton skeleton-row" />
          <div className="skeleton skeleton-row" />
          <div className="skeleton skeleton-row" />
        </div>
      </section>
    </main>
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
