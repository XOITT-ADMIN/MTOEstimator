import { useCallback, useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { api, events } from "../api/client";

// One list of documents, cached in AsyncStorage. Callers mutate through `apply(prev => next)`
// exactly as they did with setState.
//
// Local mode (no `remote`): the list lives on this device only — how the app always worked.
//
// Remote mode (`remote: { resource, companyId }`): the list is the company's shared copy on the
// API (GET/POST /sync/:resource). This hook is the only place that knows about it:
//   · offline-first — the cache (per company) opens instantly; changes are queued in AsyncStorage
//     and pushed when the server is reachable, so field work never waits on the network;
//   · every apply() is diffed by id against the previous list → upserts/deletes in the queue;
//   · the server's answer wins: it can return a newer copy (e.g. the real estimate number), say
//     ours was stale, or refuse a change (out of stock / not allowed) → we reload its copy and
//     surface the reason in `syncError`;
//   · a WebSocket event "<resource> changed" (another engineer saved) triggers a reload.
export function useLocalCollection({ localKey, seed, remote }) {
  const resource = remote?.resource || null;
  const companyId = remote?.companyId || null;
  const isRemote = !!(resource && companyId);
  const cacheKey = isRemote ? `${localKey}@${companyId}` : localKey;
  const queueKey = `${cacheKey}:queue`;

  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [syncError, setSyncError] = useState(null);
  const [pending, setPending] = useState(0);
  const [online, setOnline] = useState(!isRemote);
  const itemsRef = useRef([]);
  // id → { op: "upsert" | "delete", doc?, v }  (v increments on every local change to that id)
  const queue = useRef(new Map());
  const seq = useRef(0);
  const flushing = useRef(false);
  const flushAgain = useRef(false);
  const retryTimer = useRef(null);
  const pushTimer = useRef(null);
  const alive = useRef(true);

  const commit = useCallback((next) => {
    itemsRef.current = next;
    setItems(next);
  }, []);

  const saveQueue = useCallback(() => {
    setPending(queue.current.size);
    if (!isRemote) return;
    AsyncStorage.setItem(queueKey, JSON.stringify(Array.from(queue.current.entries()))).catch(() => {});
  }, [isRemote, queueKey]);

  // Server list + anything we still have to push (our pending edits win until the server answers).
  const mergeServer = useCallback((serverItems) => {
    const q = queue.current;
    const out = serverItems.filter((it) => !(q.get(it.id)?.op === "delete"));
    const byId = new Map(out.map((it, i) => [it.id, i]));
    q.forEach((entry, id) => {
      if (entry.op !== "upsert") return;
      if (byId.has(id)) out[byId.get(id)] = entry.doc;
      else out.unshift(entry.doc);
    });
    return out;
  }, []);

  const pull = useCallback(async () => {
    if (!isRemote) return;
    try {
      const r = await api("GET", `/sync/${resource}`);
      if (!alive.current) return;
      setOnline(true);
      commit(mergeServer(r.items || []));
    } catch (e) {
      if (e?.offline) setOnline(false);
    }
  }, [isRemote, resource, commit, mergeServer]);

  const flush = useCallback(async () => {
    if (!isRemote || !queue.current.size) return;
    if (flushing.current) {
      flushAgain.current = true;
      return;
    }
    flushing.current = true;
    clearTimeout(retryTimer.current);
    const batch = Array.from(queue.current.entries());
    const upserts = batch.filter(([, e]) => e.op === "upsert").map(([, e]) => e.doc);
    const deletes = batch.filter(([, e]) => e.op === "delete").map(([id]) => id);
    let refused = null;
    try {
      const r = await api("POST", `/sync/${resource}`, { upserts, deletes });
      setOnline(true);
      const sent = new Map(batch);
      let list = itemsRef.current;
      (r.results || []).forEach((res) => {
        const was = sent.get(res.id);
        const now = queue.current.get(res.id);
        // Changed again while this was in flight → keep the newer edit queued.
        if (was && now && now.v === was.v) queue.current.delete(res.id);
        if (!res.ok) {
          refused = refused || res.error || "The server refused a change.";
          return;
        }
        if (res.item && (!now || now.v === was?.v)) {
          list = list.map((it) => (it.id === res.id ? res.item : it));
        }
      });
      saveQueue();
      if (alive.current) commit(list);
      if (refused) {
        setSyncError(refused);
        await pull(); // put the server's copy back on screen
      }
    } catch (e) {
      if (e?.offline) {
        setOnline(false);
        retryTimer.current = setTimeout(() => flush(), 15000);
      } else if (e?.status === 401) {
        // AuthContext signs out.
      } else {
        // Whole batch refused (e.g. bad data): drop it so one bad change can't jam the queue.
        batch.forEach(([id, e0]) => {
          if (queue.current.get(id)?.v === e0.v) queue.current.delete(id);
        });
        saveQueue();
        setSyncError(e?.message || "Could not save your changes.");
        await pull();
      }
    } finally {
      flushing.current = false;
      if (flushAgain.current) {
        flushAgain.current = false;
        flush();
      }
    }
  }, [isRemote, resource, commit, saveQueue, pull]);

  // ── Load cache (+ queue), then catch up with the server ───────────────────
  useEffect(() => {
    let cancelled = false;
    alive.current = true;
    setLoaded(false);
    queue.current = new Map();
    setPending(0);
    setSyncError(null);
    (async () => {
      try {
        const [raw, rawQueue] = await Promise.all([
          AsyncStorage.getItem(cacheKey),
          isRemote ? AsyncStorage.getItem(queueKey) : Promise.resolve(null),
        ]);
        if (cancelled) return;
        if (rawQueue) queue.current = new Map(JSON.parse(rawQueue));
        setPending(queue.current.size);
        // The shared workspace starts from the server's data, never from demo seed data.
        commit(raw ? JSON.parse(raw) : !isRemote && seed ? seed() : []);
      } catch (e) {
        if (!cancelled) commit(!isRemote && seed ? seed() : []);
      } finally {
        if (!cancelled) setLoaded(true);
      }
      if (!cancelled && isRemote) {
        await flush();
        await pull();
      }
    })();
    return () => {
      cancelled = true;
      alive.current = false;
      clearTimeout(retryTimer.current);
      clearTimeout(pushTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(cacheKey, JSON.stringify(items)).catch(() => {});
  }, [items, loaded, cacheKey]);

  // ── Live updates ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isRemote) return undefined;
    return events.subscribe((msg) => {
      if (msg.type === "online") {
        setOnline(true);
        flush().then(pull);
      } else if (msg.type === "offline") {
        setOnline(false);
      } else if (msg.type === "changed" && msg.resource === resource) {
        pull();
      }
    });
  }, [isRemote, resource, flush, pull]);

  const apply = useCallback(
    (fn) => {
      const prev = itemsRef.current;
      const next = fn(prev);
      if (next === prev) return;
      commit(next);
      if (!isRemote) return;
      // Diff by id: a changed object reference = an edited document.
      const prevById = new Map(prev.map((it) => [it.id, it]));
      const nextIds = new Set();
      next.forEach((it) => {
        nextIds.add(it.id);
        if (prevById.get(it.id) !== it) queue.current.set(it.id, { op: "upsert", doc: it, v: ++seq.current });
      });
      prev.forEach((it) => {
        if (!nextIds.has(it.id)) queue.current.set(it.id, { op: "delete", v: ++seq.current });
      });
      saveQueue();
      // Typing in a field calls apply() on every keystroke — send once the typing pauses.
      clearTimeout(pushTimer.current);
      pushTimer.current = setTimeout(() => flush(), 500);
    },
    [commit, isRemote, saveQueue, flush]
  );

  // Stable identity: the contexts wrap apply in useCallback(..., []) and must always reach the
  // current (local or remote) version.
  const applyRef = useRef(apply);
  applyRef.current = apply;
  const stableApply = useCallback((fn) => applyRef.current(fn), []);

  const clearSyncError = useCallback(() => setSyncError(null), []);

  return { items, loaded, apply: stableApply, syncError, clearSyncError, remote: isRemote, pending, online, reload: pull };
}
