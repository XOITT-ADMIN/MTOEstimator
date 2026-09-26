import React from "react";
import { View } from "react-native";

import { TopBar, IconButton, StatusBadge, Tabs, T, Icon, HStack } from "../../ui";
import { useSyncState } from "../sync";

// Top of the estimate screen: back · EST-0001 [Draft] ✓ Saved · project name · PDF button,
// then the Details / Items / Summary tabs.
export function EstimateHeader({ estimate, tab, onTab, onBack, onPdf }) {
  return (
    <TopBar
      onBack={onBack}
      eyebrow={
        <HStack gap={8}>
          <T variant="label" weight={600} num style={{ letterSpacing: 0.5 }}>
            {estimate.estimateNumber}
          </T>
          <StatusBadge status={estimate.status} />
          <SaveState />
        </HStack>
      }
      title={
        <T variant="rowTitle" size={17} color="navy" numberOfLines={1} style={{ lineHeight: 24 }}>
          {estimate.name}
        </T>
      }
      right={<IconButton icon="fileDown" label="Preview PDF quotation" color="blue700" onPress={onPdf} />}
    >
      <Tabs
        style={{ marginHorizontal: 8, marginTop: 6 }}
        active={tab}
        onChange={onTab}
        tabs={[
          { key: "details", label: "Details" },
          { key: "items", label: "Items", count: estimate.items.length },
          { key: "summary", label: "Summary" },
        ]}
      />
    </TopBar>
  );
}

// "✓ Saved" / "Saving…" / "Offline" next to the status badge.
function SaveState() {
  const { state } = useSyncState();
  const map = {
    saved: ["check", "success", "Saved"],
    local: ["check", "success", "Saved"],
    saving: ["refresh", "muted", "Saving…"],
    offline: ["wifiOff", "warningText", "Offline"],
  };
  const [icon, color, label] = map[state] || map.saved;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
      <Icon name={icon} size={14} color={color} />
      <T variant="caption" weight={600} color={color}>
        {label}
      </T>
    </View>
  );
}
