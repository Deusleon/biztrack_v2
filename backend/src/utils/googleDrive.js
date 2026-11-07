// Minimal Google Drive client for BizTrack cloud backups.
// Uses the user's own Google account via an OAuth2 refresh token, so files
// land in THEIR Google Drive and count against THEIR storage.
// No external dependencies — uses Node's native fetch (Node 18+).

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API_BASE = "https://www.googleapis.com/drive/v3";
const UPLOAD_BASE = "https://www.googleapis.com/upload/drive/v3";
const DEFAULT_FOLDER_NAME = "BizTrack Backups";

class GoogleDriveClient {
  /**
   * @param {object} config - { client_id, client_secret, refresh_token, folder_id? }
   */
  constructor(config = {}) {
    this.clientId = config.client_id;
    this.clientSecret = config.client_secret;
    this.refreshToken = config.refresh_token;
    this.folderId = config.folder_id || null;
    this._accessToken = null;
    this._accessTokenExpiresAt = 0;
  }

  isConfigured() {
    return Boolean(this.clientId && this.clientSecret && this.refreshToken);
  }

  async getAccessToken() {
    if (this._accessToken && Date.now() < this._accessTokenExpiresAt - 60_000) {
      return this._accessToken;
    }

    const body = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      refresh_token: this.refreshToken,
      grant_type: "refresh_token",
    });

    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.access_token) {
      throw new Error(
        `Google token refresh failed (${response.status}): ${data.error_description || data.error || "unknown error"}`,
      );
    }

    this._accessToken = data.access_token;
    this._accessTokenExpiresAt = Date.now() + (data.expires_in || 3600) * 1000;
    return this._accessToken;
  }

  async _request(url, options = {}) {
    const token = await this.getAccessToken();
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    });

    if (response.status === 204) return null;

    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }

    if (!response.ok) {
      const message = data?.error?.message || text || `HTTP ${response.status}`;
      throw new Error(`Google Drive API error (${response.status}): ${message}`);
    }
    return data;
  }

  /** Verify the connection works. Returns the connected account's email. */
  async getAccountInfo() {
    const data = await this._request(
      `${API_BASE}/about?fields=user(displayName,emailAddress),storageQuota(usage,limit)`,
    );
    return {
      email: data?.user?.emailAddress || null,
      name: data?.user?.displayName || null,
      storageUsed: Number(data?.storageQuota?.usage || 0),
      storageLimit: Number(data?.storageQuota?.limit || 0),
    };
  }

  /**
   * Resolve the backup folder id. Uses the configured folder_id when given;
   * otherwise finds (or creates) a "BizTrack Backups" folder in My Drive.
   */
  async ensureBackupFolder() {
    if (this.folderId) return this.folderId;

    const q = encodeURIComponent(
      `name = '${DEFAULT_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false and 'root' in parents`,
    );
    const found = await this._request(`${API_BASE}/files?q=${q}&fields=files(id,name)&pageSize=1`);
    if (found?.files?.length) {
      this.folderId = found.files[0].id;
      return this.folderId;
    }

    const created = await this._request(`${API_BASE}/files?fields=id`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: DEFAULT_FOLDER_NAME,
        mimeType: "application/vnd.google-apps.folder",
      }),
    });
    this.folderId = created.id;
    return this.folderId;
  }

  /**
   * Upload a file (Buffer) into the given folder using a multipart request.
   * Returns { id, name, size, webViewLink }.
   */
  async uploadFile({ name, buffer, mimeType = "application/gzip", folderId }) {
    const boundary = `biztrack_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
    const metadata = JSON.stringify({ name, parents: folderId ? [folderId] : undefined });

    const head = Buffer.from(
      `--${boundary}\r\n` +
        `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
        `${metadata}\r\n` +
        `--${boundary}\r\n` +
        `Content-Type: ${mimeType}\r\n\r\n`,
      "utf8",
    );
    const tail = Buffer.from(`\r\n--${boundary}--`, "utf8");
    const body = Buffer.concat([head, buffer, tail]);

    return this._request(
      `${UPLOAD_BASE}/files?uploadType=multipart&fields=id,name,size,webViewLink`,
      {
        method: "POST",
        headers: {
          "Content-Type": `multipart/related; boundary=${boundary}`,
          "Content-Length": String(body.length),
        },
        body,
      },
    );
  }

  /** List backup files inside a folder, oldest first. */
  async listFiles(folderId) {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
    const data = await this._request(
      `${API_BASE}/files?q=${q}&fields=files(id,name,size,createdTime)&orderBy=createdTime&pageSize=1000`,
    );
    return data?.files || [];
  }

  /**
   * Download a file from Google Drive by its file ID.
   * Returns a Buffer containing the file contents.
   */
  async downloadFile(fileId) {
    const token = await this.getAccessToken();
    const response = await fetch(`${API_BASE}/files/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Google Drive download error (${response.status}): ${text}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async deleteFile(fileId) {
    await this._request(`${API_BASE}/files/${fileId}`, { method: "DELETE" });
  }
}

export { GoogleDriveClient, DEFAULT_FOLDER_NAME };

