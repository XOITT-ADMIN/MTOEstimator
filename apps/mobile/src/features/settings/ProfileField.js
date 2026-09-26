import React, { useEffect, useRef, useState } from "react";
import { View, TextInput } from "react-native";

import { T, Icon, inputText, colors } from "../../ui";

// One company-profile field, edited right where it's shown (no Edit / Done mode).
// Keeps its own draft while focused so a slow save can't jump the cursor; saves after a
// short pause in typing and on blur, then shows "✓ Saved" for a moment.
export function ProfileField({ label, value, placeholder, onSave, editable = true, multiline, ...input }) {
  const [draft, setDraft] = useState(value || "");
  const [focused, setFocused] = useState(false);
  const [saved, setSaved] = useState(false);
  const timer = useRef(null);
  const savedTimer = useRef(null);

  useEffect(() => {
    if (!focused) setDraft(value || "");
  }, [value, focused]);
  useEffect(() => () => [timer, savedTimer].forEach((t) => clearTimeout(t.current)), []);

  function commit(v) {
    if ((v || "") === (value || "")) return;
    onSave(v);
    setSaved(true);
    clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaved(false), 1600);
  }

  return (
    <View style={{ gap: 4, paddingHorizontal: 16, paddingVertical: 12, minHeight: 68, backgroundColor: focused ? colors.tintBlueSoft : colors.surface }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <T variant="caption">{label}</T>
        {saved ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
            <Icon name="check" size={13} color="success" />
            <T variant="caption" weight={600} color="success">
              Saved
            </T>
          </View>
        ) : null}
      </View>
      {editable ? (
        <TextInput
          value={draft}
          onChangeText={(v) => {
            setDraft(v);
            clearTimeout(timer.current);
            timer.current = setTimeout(() => commit(v), 700);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            clearTimeout(timer.current);
            commit(draft.trim());
          }}
          placeholder={placeholder}
          placeholderTextColor={colors.blue600}
          multiline={multiline}
          accessibilityLabel={label}
          {...input}
          style={[inputText, { fontSize: multiline ? 15 : 16, lineHeight: multiline ? 22 : undefined, minHeight: multiline ? 88 : 32, paddingVertical: 0, textAlignVertical: multiline ? "top" : "center", outlineStyle: "none" }]}
        />
      ) : (
        <T variant="body" size={16} numberOfLines={multiline ? 8 : 1} color={value ? "text" : "faint"}>
          {value || "—"}
        </T>
      )}
    </View>
  );
}
