import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";

import { Blueprint, Logo, Button, TextButton, T, Icon, MadeByXoitt } from "../ui";
import { useAppLock } from "../context/AppLockContext";
import { useAuth } from "../context/AuthContext";

// Full-screen cover shown while XMTO is locked. Asks for the fingerprint / Face ID straight away.
export default function LockScreen() {
  const { locked, unlock, method, error } = useAppLock();
  const { user, signOut } = useAuth();

  useEffect(() => {
    if (locked) unlock();
  }, [locked]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!locked) return null;
  const first = user?.name ? user.name.split(" ")[0] : null;

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 2000 }]} accessibilityViewIsModal>
      <Blueprint fill style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 28, gap: 10 }}>
        <Logo size={48} onDark align="center" />
        <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: "rgba(255,255,255,0.10)", alignItems: "center", justifyContent: "center", marginTop: 32 }}>
          <Icon name="lock" size={32} color="white" />
        </View>
        <T variant="heading" color="white" center style={{ marginTop: 12 }}>
          XMTO is locked
        </T>
        <T variant="body" color="onNavyMuted" center>
          {first ? `${first}, use` : "Use"} your {method} to open it.
        </T>
        {error ? (
          <T variant="label" color="#F6B9B0" center>
            {error}
          </T>
        ) : null}
        <Button title="Unlock" icon="lock" onPress={unlock} style={{ marginTop: 20, minWidth: 240 }} />
        <TextButton title="Sign out instead" color="onNavyMuted" onPress={signOut} style={{ marginTop: 8, height: 48 }} />
        <View style={{ position: "absolute", bottom: 36 }}>
          <MadeByXoitt onDark />
        </View>
      </Blueprint>
    </View>
  );
}
