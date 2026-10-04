import React, { useEffect, useRef, useState } from "react";
import { View, TextInput, Pressable, ScrollView, KeyboardAvoidingView, Platform, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Blueprint, Logo, T, Icon, Button, Field, MadeByXoitt, colors, fonts, radius } from "../ui";
import { useAuth, OTP_LENGTH, OTP_RESEND_SECONDS, isValidEmail } from "../context/AuthContext";

// Sign in with email only: name + work email → 6-digit code → in.
// Tall phones get the full navy hero; short phones (and the code step) get a compact one.

const FEATURES = ["Log items by trade, size and quantity", "Budget rates and stock from your company library", "Send a GST-ready PDF quote in one tap"];

function HeroFull() {
  return (
    <Blueprint style={{ paddingTop: 60, paddingHorizontal: 24, paddingBottom: 44, gap: 20 }}>
      <EstimateGhost />
      <Logo size={40} onDark />
      <T size={26} weight={600} color="white" style={{ lineHeight: 34, maxWidth: 300 }}>
        Material take-offs, made simple.
      </T>
      <View style={{ gap: 10 }}>
        {FEATURES.map((f) => (
          <View key={f} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: "rgba(69,137,204,0.28)", alignItems: "center", justifyContent: "center" }}>
              <Icon name="check" size={14} color="#BFD8F2" />
            </View>
            <T variant="sub" color="#D5E0F0">
              {f}
            </T>
          </View>
        ))}
      </View>
    </Blueprint>
  );
}

function HeroCompact({ top }) {
  return (
    <Blueprint style={{ paddingTop: top, paddingHorizontal: 24, paddingBottom: 36, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <Logo size={30} onDark />
      <T variant="label" weight={400} color="onNavyMuted" style={{ textAlign: "right" }}>
        {"Material take-offs,\nmade simple."}
      </T>
    </Blueprint>
  );
}

// Dashed outline of an estimate, top-right of the hero (decoration only).
function EstimateGhost() {
  const bar = (w, o) => <View style={{ height: 6, width: w, borderRadius: 3, backgroundColor: `rgba(201,214,234,${o})` }} />;
  return (
    <View pointerEvents="none" style={{ position: "absolute", right: -26, top: 40, width: 170, padding: 14, borderWidth: 1.5, borderStyle: "dashed", borderColor: "rgba(143,184,230,0.55)", borderRadius: 14, gap: 10, backgroundColor: "rgba(31,33,80,0.4)" }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <T size={10} weight={600} color="#8FB8E6" style={{ letterSpacing: 1 }}>
          MTO-0001
        </T>
        <View style={{ width: 28, height: 10, borderRadius: 5, backgroundColor: "rgba(69,137,204,0.6)" }} />
      </View>
      {[
        [70, 36],
        [90, 30],
        [56, 40],
      ].map(([a, b], i) => (
        <View key={i} style={{ flexDirection: "row", justifyContent: "space-between" }}>
          {bar(a, 0.35)}
          {bar(b, 0.5)}
        </View>
      ))}
      <View style={{ height: 1, backgroundColor: "rgba(143,184,230,0.4)" }} />
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <T size={10} color="#8FB8E6">
          Total
        </T>
        <T size={13} weight={600} color="white" num>
          ₹8,024.00
        </T>
      </View>
    </View>
  );
}

function CodeBoxes({ value, onChange, inputRef, disabled }) {
  const digits = value.split("");
  return (
    <Pressable onPress={() => inputRef.current?.focus()} accessibilityLabel="6-digit code" style={{ flexDirection: "row", gap: 8 }}>
      {Array.from({ length: OTP_LENGTH }).map((_, i) => {
        const active = i === Math.min(value.length, OTP_LENGTH - 1);
        return (
          <View key={i} style={{ flex: 1, height: 64, borderRadius: radius.m, backgroundColor: colors.surface, borderWidth: active ? 2 : 1.5, borderColor: active ? colors.action : colors.border, alignItems: "center", justifyContent: "center" }}>
            <T size={28} weight={600} color="navy" num>
              {digits[i] || ""}
            </T>
          </View>
        );
      })}
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChange}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={OTP_LENGTH}
        editable={!disabled}
        caretHidden
        accessibilityLabel="One-time code"
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0, fontSize: 16 }}
      />
    </Pressable>
  );
}

export default function LoginScreen() {
  const { requestOtp, verifyOtp, cancelOtp, otp, signingIn, error, lastEmail, lastName } = useAuth();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [resendIn, setResendIn] = useState(0);
  const codeRef = useRef(null);
  const tall = height >= 780;

  useEffect(() => {
    if (lastEmail && !email) setEmail(lastEmail);
    if (lastName && !name) setName(lastName);
  }, [lastEmail, lastName]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!otp) return undefined;
    setCode("");
    setResendIn(OTP_RESEND_SECONDS);
    const focus = setTimeout(() => codeRef.current?.focus(), 250);
    const tick = setInterval(() => setResendIn((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => {
      clearTimeout(focus);
      clearInterval(tick);
    };
  }, [otp?.sentAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const canSend = name.trim().length >= 2 && isValidEmail(email) && !signingIn;
  const send = () => canSend && requestOtp(email, name);
  const onCode = (v) => {
    const d = v.replace(/\D/g, "").slice(0, OTP_LENGTH);
    setCode(d);
    if (d.length === OTP_LENGTH && !signingIn) verifyOtp(d); // auto-verify on the last digit
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.navy }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" bounces={false}>
        {otp || !tall ? <HeroCompact top={Math.max(insets.top, 20) + 32} /> : <HeroFull />}

        <View style={{ flexGrow: 1, backgroundColor: colors.canvas, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, marginTop: -20, paddingTop: 24, paddingHorizontal: 24, paddingBottom: Math.max(insets.bottom, 16) + 12 }}>
          <View style={{ width: "100%", maxWidth: 460, alignSelf: "center", gap: 16 }}>
            {!otp ? (
              <>
                <View>
                  <T size={22} weight={600} color="navy">
                    Sign in
                  </T>
                  <T variant="sub" style={{ marginTop: 2 }}>
                    We'll email you a 6-digit code. No password.
                  </T>
                </View>
                <Field label="Your name" value={name} onChangeText={setName} placeholder="e.g. Ravi Kumar" autoCapitalize="words" autoComplete="name" returnKeyType="next" />
                <Field label="Work email" value={email} onChangeText={setEmail} placeholder="you@company.in" keyboardType="email-address" autoCapitalize="none" autoComplete="email" returnKeyType="send" onSubmitEditing={send} error={error || undefined} />
                <Button title="Send code" iconRight="chevronRight" onPress={send} disabled={!canSend} loading={signingIn} />
                <T variant="caption" weight={400} center style={{ lineHeight: 18 }}>
                  Invited by your company? Use the email they added. By continuing you agree to XMTO storing your name and email for sign-in.
                </T>
                <MadeByXoitt />
              </>
            ) : (
              <>
                <Pressable onPress={cancelOtp} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", gap: 4, height: 48, marginVertical: -8, marginLeft: -6, alignSelf: "flex-start" }}>
                  <Icon name="chevronLeft" size={22} color="blue700" />
                  <T variant="body" weight={500} color="blue700">
                    Change email
                  </T>
                </Pressable>
                <View>
                  <T size={22} weight={600} color="navy">
                    Enter your code
                  </T>
                  <T variant="sub" style={{ marginTop: 2 }}>
                    Sent to{" "}
                    <T variant="sub" weight={500} color="text">
                      {otp.email}
                    </T>
                  </T>
                </View>
                <CodeBoxes value={code} onChange={onCode} inputRef={codeRef} disabled={signingIn} />
                {error ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Icon name="alert" size={16} color="danger" />
                    <T variant="label" weight={400} color="danger" style={{ flex: 1 }}>
                      {error}
                    </T>
                  </View>
                ) : null}
                <View style={{ minHeight: 24, flexDirection: "row", alignItems: "center" }}>
                  {resendIn > 0 ? (
                    <T variant="sub" num>
                      Resend code in {resendIn}s
                    </T>
                  ) : (
                    <Pressable onPress={() => requestOtp(otp.email, otp.name)} disabled={signingIn} hitSlop={10}>
                      <T variant="sub" weight={600} color="blue700">
                        Resend code
                      </T>
                    </Pressable>
                  )}
                </View>
                {otp.demoCode ? (
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingVertical: 10, paddingLeft: 14, paddingRight: 10, borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.dashed, borderRadius: radius.m, backgroundColor: "#F7F9FC" }}>
                    <View>
                      <T size={11} weight={700} color="blue700" style={{ letterSpacing: 1.1 }}>
                        DEMO
                      </T>
                      <T variant="label" weight={400}>
                        Your code is{" "}
                        <T variant="label" weight={600} color="text" num>
                          {otp.demoCode.slice(0, 3)} {otp.demoCode.slice(3)}
                        </T>
                      </T>
                    </View>
                    <Button title="Fill code" tone="soft" compact onPress={() => onCode(otp.demoCode)} />
                  </View>
                ) : null}
              </>
            )}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
