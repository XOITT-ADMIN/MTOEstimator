import React, { useEffect, useState } from "react";
import { View } from "react-native";

import { T } from "../../ui";
import { WaveBars } from "../../ui/components/BusyOverlay";
import { useSyncState } from "../sync";

// A spinner in the middle of the screen while the MTO is saving. It only appears if saving takes
// a moment (so quick autosaves don't flicker) and never blocks touches.
export function SavingOverlay({ delay = 350 }) {
  const { state } = useSyncState();
  const saving = state === "saving";
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!saving) {
      setShow(false);
      return undefined;
    }
    const t = setTimeout(() => setShow(true), delay);
    return () => clearTimeout(t);
  }, [saving, delay]);

  if (!show) return null;
  return (
    <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", zIndex: 50 }}>
      <View style={{ alignItems: "center", gap: 10, paddingHorizontal: 28, paddingVertical: 22, borderRadius: 16, backgroundColor: "rgba(15, 30, 55, 0.82)" }}>
        <WaveBars />
        <T variant="label" weight={600} color="white">
          Saving…
        </T>
      </View>
    </View>
  );
}
