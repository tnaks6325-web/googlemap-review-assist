"use client";

import { useSyncExternalStore } from "react";

export type AdminDisplayMode = "desktop" | "mobile";

const ADMIN_DISPLAY_MODE_STORAGE_KEY = "admin-display-mode";
const ADMIN_DISPLAY_MODE_CHANGE_EVENT = "admin-display-mode-change";
const MOBILE_WORKSPACE_QUERY = "(max-width: 1023px)";

export function nextAdminDisplayMode(mode: AdminDisplayMode): AdminDisplayMode {
  return mode === "desktop" ? "mobile" : "desktop";
}

function getAdminDisplayModeSnapshot(): AdminDisplayMode {
  if (typeof window === "undefined") return "desktop";
  return window.localStorage.getItem(ADMIN_DISPLAY_MODE_STORAGE_KEY) === "mobile"
    ? "mobile"
    : "desktop";
}

function subscribeToAdminWorkspace(onStoreChange: () => void) {
  const mediaQuery = window.matchMedia(MOBILE_WORKSPACE_QUERY);
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(ADMIN_DISPLAY_MODE_CHANGE_EVENT, onStoreChange);
  mediaQuery.addEventListener("change", onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(ADMIN_DISPLAY_MODE_CHANGE_EVENT, onStoreChange);
    mediaQuery.removeEventListener("change", onStoreChange);
  };
}

export function useAdminDisplayMode() {
  return useSyncExternalStore<AdminDisplayMode>(
    subscribeToAdminWorkspace,
    getAdminDisplayModeSnapshot,
    () => "desktop",
  );
}

export function useAdminMobileWorkspace() {
  return useSyncExternalStore(
    subscribeToAdminWorkspace,
    () => window.matchMedia(MOBILE_WORKSPACE_QUERY).matches || getAdminDisplayModeSnapshot() === "mobile",
    () => false,
  );
}

export function setAdminDisplayMode(mode: AdminDisplayMode) {
  window.localStorage.setItem(ADMIN_DISPLAY_MODE_STORAGE_KEY, mode);
  window.dispatchEvent(new Event(ADMIN_DISPLAY_MODE_CHANGE_EVENT));
}
