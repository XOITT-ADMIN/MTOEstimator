import React from "react";
import { View } from "react-native";

import { Sheet, Group, Row, IconTile, Avatar, T, colors } from "../ui";

// Account menu opened from the avatar on Home.
export default function AccountMenu({ visible, onClose, user, companyName, onSettings, onSignOut }) {
  return (
    <Sheet visible={visible} onClose={onClose}>
      <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8, gap: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Avatar name={user?.name} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <T variant="rowTitle" numberOfLines={1}>
              {user?.name || "Signed in"}
            </T>
            <T variant="label" weight={400} numberOfLines={1}>
              {[user?.email, companyName].filter(Boolean).join(" · ")}
            </T>
          </View>
        </View>
        <Group>
          <Row key="settings" left={<IconTile icon="settings" />} onPress={onSettings}>
            <T variant="bodyStrong">Settings</T>
          </Row>
          <Row key="out" left={<IconTile icon="signOut" bg={colors.dangerTint} color="danger" />} onPress={onSignOut} chevron={false}>
            <T variant="bodyStrong" color="danger">
              Sign out
            </T>
          </Row>
        </Group>
      </View>
    </Sheet>
  );
}
