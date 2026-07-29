import type { SyncChangeSet, SyncGateway, SyncPullResult, SyncPushResult } from "@habit-tracker/core";

/**
 * Talks to apps/backend over HTTP. See docs/architecture.md §4-4 for the
 * iOS-simulator vs Android-emulator vs real-device host caveats around
 * whatever `baseUrl` the Developer settings screen is configured with.
 */
export class RestSyncGateway implements SyncGateway {
  constructor(
    private readonly baseUrl: string,
    private readonly deviceToken: string,
  ) {}

  private get headers() {
    return { "Content-Type": "application/json", "x-device-token": this.deviceToken };
  }

  async push(changes: SyncChangeSet): Promise<SyncPushResult> {
    const res = await fetch(`${this.baseUrl}/api/v1/sync/push`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(changes),
    });
    if (!res.ok) throw new Error(`sync push failed: ${res.status} ${await res.text()}`);
    return res.json();
  }

  async pull(sinceIso: string): Promise<SyncPullResult> {
    const res = await fetch(`${this.baseUrl}/api/v1/sync/pull?since=${encodeURIComponent(sinceIso)}`, {
      headers: this.headers,
    });
    if (!res.ok) throw new Error(`sync pull failed: ${res.status} ${await res.text()}`);
    return res.json();
  }
}
