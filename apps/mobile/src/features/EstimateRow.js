import React from "react";
import { View } from "react-native";

import { Row, T, StatusBadge, TradePill, HStack, Icon } from "../ui";
import { money, plural } from "./estimates";
import { useProjects } from "../context/ProjectsContext";

// One MTO in a list: name / project · status · trades · meta ; value on the right.
export function EstimateRow({ s, onPress, showBy }) {
  const e = s.estimate;
  const { getProject } = useProjects();
  const projectName = getProject(e.projectId)?.name;
  const meta = [plural(s.items, "item"), s.date, showBy && s.by ? `by ${s.by}` : null].filter(Boolean).join(" · ");
  return (
    <Row onPress={onPress} chevron={false} minHeight={76} style={{ paddingVertical: 14 }} accessibilityLabel={`${e.name}, ${e.status}, ${money(s.value, false)}`}>
      <View style={{ flexDirection: "row", gap: 12 }}>
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <T variant="rowTitle" numberOfLines={1}>
            {e.name || "Untitled MTO"}
          </T>
          <T variant="label" weight={400} numberOfLines={1}>
            {projectName || "No project"}
          </T>
          <HStack gap={8} style={{ marginTop: 4 }}>
            <StatusBadge status={e.status} />
            {s.trades.map((t) => (
              <TradePill key={t} trade={t} iconOnly />
            ))}
            <T variant="caption" weight={400} numberOfLines={1} style={{ flexShrink: 1 }}>
              {meta}
            </T>
          </HStack>
        </View>
        <View style={{ alignItems: "flex-end", justifyContent: "space-between" }}>
          <T variant="rowTitle" num>
            {money(s.value, false)}
          </T>
          <Icon name="chevronRight" size={20} color="chevron" />
        </View>
      </View>
    </Row>
  );
}
