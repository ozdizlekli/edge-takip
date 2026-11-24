(function (global) {
  'use strict';

  const STORAGE_KEY = 'tubitak_2209a_edge_project_state_v1';
  const SYNC_URL_KEY = 'tubitak_2209a_cloud_sync_url_v1';
  const LOCAL_MEMBER_KEY = 'tubitak_2209a_active_member_v1';

  function cloneValue(val) {
    if (typeof structuredClone === 'function') {
      return structuredClone(val);
    }
    return JSON.parse(JSON.stringify(val));
  }

  function timeoutSignal(ms) {
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
      return AbortSignal.timeout(ms);
    }
    return undefined;
  }

  function normalizeCloudUrl(rawUrl) {
    const trimmed = String(rawUrl || '').trim();
    if (!trimmed) return '';
    try {
      const parsed = new URL(trimmed);
      if (!parsed.protocol.startsWith('http')) return '';
      if (
        (parsed.hostname.endsWith('firebaseio.com') || parsed.hostname.endsWith('firebasedatabase.app')) &&
        !parsed.pathname.endsWith('.json')
      ) {
        const basePath = parsed.pathname === '/' ? '/tubitak2209a' : parsed.pathname.replace(/\/+$/, '');
        parsed.pathname = `${basePath}.json`;
      }
      return parsed.toString();
    } catch {
      return '';
    }
  }

  class ProjectStore {
    constructor() {
      const { createInitialProjectState } = global.EdgeTrackerSeed;
      this.state = createInitialProjectState();
      this.storageMode = 'local'; // 'cloud+local' | 'disk+local' | 'local'
      this.cloudUrl = '';
      this.hasApiServer = false;
      this.listeners = new Set();
      this.saveQueue = Promise.resolve();
      this.isSaving = false;
      this.pollTimer = null;
    }

    subscribe(listener) {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }

    notify(meta = {}) {
      for (const listener of this.listeners) {
        listener(this.state, meta);
      }
    }

    getLocalActiveMember() {
      try {
        return window.localStorage.getItem(LOCAL_MEMBER_KEY) || 'all';
      } catch {
        return 'all';
      }
    }

    setLocalActiveMember(memberId) {
      try {
        window.localStorage.setItem(LOCAL_MEMBER_KEY, memberId || 'all');
      } catch {
        // Ignore
      }
    }

    resolveInitialCloudUrl() {
      try {
        const params = new URLSearchParams(window.location.search);
        const fromQuery = normalizeCloudUrl(params.get('sync'));
        if (fromQuery) {
          window.localStorage.setItem(SYNC_URL_KEY, fromQuery);
          return fromQuery;
        }
      } catch {
        // Ignore
      }

      try {
        const saved = normalizeCloudUrl(window.localStorage.getItem(SYNC_URL_KEY));
        if (saved) return saved;
      } catch {
        // Ignore
      }

      const fromConfig = normalizeCloudUrl(global.EDGE_SYNC_CONFIG?.cloudSyncUrl);
      return fromConfig;
    }

    async setCloudSyncUrl(rawUrl) {
      const normalized = normalizeCloudUrl(rawUrl);
      this.cloudUrl = normalized;
      try {
        if (normalized) {
          window.localStorage.setItem(SYNC_URL_KEY, normalized);
        } else {
          window.localStorage.removeItem(SYNC_URL_KEY);
        }
      } catch {
        // Ignore
      }

      if (normalized) {
        const remote = await this.fetchCloudState();
        if (remote && Array.isArray(remote.tasks)) {
          this.state = this.normalizeState(remote);
          this.writeLocalStorage(this.state);
        } else {
          await this.persist();
        }
        this.storageMode = 'cloud+local';
      } else {
        this.storageMode = this.hasApiServer ? 'disk+local' : 'local';
      }
      this.notify({ type: 'sync-config' });
      return normalized;
    }

    buildShareUrl() {
      const base = `${window.location.origin}${window.location.pathname}`;
      if (!this.cloudUrl) return base;
      const params = new URLSearchParams();
      params.set('sync', this.cloudUrl);
      return `${base}?${params.toString()}`;
    }

    async fetchCloudState() {
      if (!this.cloudUrl) return null;
      try {
        const res = await fetch(this.cloudUrl, {
          signal: timeoutSignal(4000),
          cache: 'no-store',
        });
        if (!res.ok) return null;
        const data = await res.json();
        return data && typeof data === 'object' && Array.isArray(data.tasks) ? data : null;
      } catch {
        return null;
      }
    }

    async pushCloudState(snapshot) {
      if (!this.cloudUrl) return false;
      try {
        const res = await fetch(this.cloudUrl, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(snapshot),
          signal: timeoutSignal(5000),
        });
        return res.ok;
      } catch {
        return false;
      }
    }

    async fetchServerState() {
      if (!window.location.protocol.startsWith('http')) return null;
      try {
        const res = await fetch('/api/state', {
          signal: timeoutSignal(3000),
          cache: 'no-store',
        });
        if (!res.ok) return null;
        this.hasApiServer = true;
        const payload = await res.json();
        return payload && payload.exists && payload.state && Array.isArray(payload.state.tasks)
          ? payload.state
          : null;
      } catch {
        return null;
      }
    }

    async init() {
      const { createInitialProjectState } = global.EdgeTrackerSeed;
      this.cloudUrl = this.resolveInitialCloudUrl();

      let loaded = null;

      if (this.cloudUrl) {
        const cloudData = await this.fetchCloudState();
        if (cloudData) {
          loaded = cloudData;
        }
        this.storageMode = 'cloud+local';
      }

      if (!loaded && window.location.protocol.startsWith('http')) {
        const serverData = await this.fetchServerState();
        if (this.hasApiServer && !this.cloudUrl) {
          this.storageMode = 'disk+local';
        }
        if (serverData) {
          loaded = serverData;
        }
      }

      const localRaw = this.readLocalStorage();
      if (!loaded && localRaw && Array.isArray(localRaw.tasks)) {
        loaded = localRaw;
      } else if (loaded && localRaw && Array.isArray(localRaw.tasks) && !this.cloudUrl) {
        const serverTime = Date.parse(loaded.savedAt || 0) || 0;
        const localTime = Date.parse(localRaw.savedAt || 0) || 0;
        if (localTime > serverTime) {
          loaded = localRaw;
        }
      }

      if (loaded) {
        this.state = this.normalizeState(loaded);
      } else {
        this.state = createInitialProjectState();
        this.state.activeMemberId = this.getLocalActiveMember();
        await this.persist();
      }

      this.state.activeMemberId = this.getLocalActiveMember();
      this.writeLocalStorage(this.state);
      this.notify({ type: 'init' });
      this.startLivePolling();
    }

    startLivePolling() {
      if (this.pollTimer) clearInterval(this.pollTimer);
      const intervalMs = Number(global.EDGE_SYNC_CONFIG?.pollIntervalMs || 4000);
      this.pollTimer = setInterval(() => {
        this.pullRemoteIfNewer();
      }, intervalMs);
    }

    async pullRemoteIfNewer() {
      if (this.isSaving) return;
      if (!this.cloudUrl && !this.hasApiServer) return;

      const remote = this.cloudUrl ? await this.fetchCloudState() : await this.fetchServerState();
      if (!remote || !remote.savedAt) return;

      const remoteTs = Date.parse(remote.savedAt) || 0;
      const localTs = Date.parse(this.state.savedAt || 0) || 0;
      if (remoteTs > localTs) {
        const activeMemberId = this.getLocalActiveMember();
        this.state = this.normalizeState(remote);
        this.state.activeMemberId = activeMemberId;
        this.writeLocalStorage(this.state);
        this.notify({ type: 'remote-sync' });
      }
    }

    normalizeState(raw) {
      const { createInitialProjectState } = global.EdgeTrackerSeed;
      const base = createInitialProjectState(raw.projectStartDate || '2026-11-24');
      return {
        ...base,
        ...cloneValue(raw),
        activeMemberId: this.getLocalActiveMember(),
        tasks: Array.isArray(raw.tasks) ? cloneValue(raw.tasks) : base.tasks,
        requests: Array.isArray(raw.requests) ? cloneValue(raw.requests) : [],
        activityLog: Array.isArray(raw.activityLog) ? cloneValue(raw.activityLog) : [],
      };
    }

    readLocalStorage() {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    }

    writeLocalStorage(state) {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        // Ignore
      }
    }

    async persist() {
      const snapshot = cloneValue(this.state);
      snapshot.savedAt = new Date().toISOString();
      delete snapshot.activeMemberId; // Keep active user selection local per teammate
      this.state.savedAt = snapshot.savedAt;
      this.writeLocalStorage(this.state);

      this.isSaving = true;
      this.saveQueue = this.saveQueue
        .then(async () => {
          if (this.cloudUrl) {
            const ok = await this.pushCloudState(snapshot);
            this.storageMode = ok ? 'cloud+local' : 'local';
          }
          if (window.location.protocol.startsWith('http') && (!this.cloudUrl || this.hasApiServer)) {
            try {
              const res = await fetch('/api/state', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(snapshot),
                signal: timeoutSignal(4000),
              });
              if (res.ok) {
                this.hasApiServer = true;
                if (!this.cloudUrl) this.storageMode = 'disk+local';
              }
            } catch {
              if (!this.cloudUrl) this.storageMode = 'local';
            }
          }
        })
        .finally(() => {
          this.isSaving = false;
        });
      await this.saveQueue;
    }

    update(mutator, logEntry = null) {
      const next = cloneValue(this.state);
      mutator(next);
      this.setLocalActiveMember(next.activeMemberId);
      if (logEntry) {
        next.activityLog.unshift({
          id: `LOG-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          timestamp: new Date().toISOString(),
          ...logEntry,
        });
        if (next.activityLog.length > 250) {
          next.activityLog.length = 250;
        }
      }
      this.state = next;
      this.notify({ type: 'update' });
      this.persist().then(() => this.notify({ type: 'saved' }));
    }

    resetToDefault() {
      const { createInitialProjectState } = global.EdgeTrackerSeed;
      const fresh = createInitialProjectState(this.state.projectStartDate || '2026-11-24');
      fresh.activeMemberId = this.getLocalActiveMember();
      this.state = fresh;
      this.notify({ type: 'reset' });
      return this.persist().then(() => this.notify({ type: 'saved' }));
    }
  }

  global.EdgeTrackerStore = { ProjectStore, normalizeCloudUrl };
})(window);
