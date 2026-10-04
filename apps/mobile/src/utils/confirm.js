import { showDialog } from "../ui/components/ConfirmDialog";

export function confirmAction({ title, message, confirmText = "OK", cancelText = "Cancel", destructive = false }) {
  return showDialog({ title, message, confirmText, cancelText, destructive, mode: "confirm" });
}

export function notify(title, message) {
  showDialog({ title, message, mode: "notify" });
}
