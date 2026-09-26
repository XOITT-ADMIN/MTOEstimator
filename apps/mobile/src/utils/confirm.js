import { Alert, Platform } from "react-native";

// Cross-platform confirm. React Native's Alert is a no-op on the web build (which is how the
// app is run during design review), so destructive actions there were silently ignored.
// Resolves true when the user confirms.
export function confirmAction({ title, message, confirmText = "OK", cancelText = "Cancel", destructive = false }) {
  if (Platform.OS === "web") {
    const text = [title, message].filter(Boolean).join("\n\n");
    // eslint-disable-next-line no-alert
    return Promise.resolve(typeof window !== "undefined" ? window.confirm(text) : true);
  }
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: cancelText, style: "cancel", onPress: () => resolve(false) },
        { text: confirmText, style: destructive ? "destructive" : "default", onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
    );
  });
}

export function notify(title, message) {
  if (Platform.OS === "web") {
    // eslint-disable-next-line no-alert
    if (typeof window !== "undefined") window.alert([title, message].filter(Boolean).join("\n\n"));
    return;
  }
  Alert.alert(title, message);
}
