import { SafeScreen } from "@/components/SafeScreen";
import { useSignIn } from "@clerk/expo";
import { type Href, Link, useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

/**
 * Validates whether a string is a well-formed email address.
 *
 * @param value - The email address to validate; leading and trailing whitespace are ignored.
 * @returns `true` if the trimmed input matches a basic email pattern, `false` otherwise.
 */
function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/**
 * Render the sign-in page and manage email/password authentication and email-code verification flows.
 *
 * Manages input state, validation, Clerk sign-in actions (password submit, send/verify email code, reset),
 * submission error reporting, loading state, and navigation to the app's main tabs after successful sign-in.
 *
 * @returns The JSX element for the sign-in page.
 */
export default function Page() {
  const { signIn, errors, fetchStatus } = useSignIn();
  const router = useRouter();

  const [emailAddress, setEmailAddress] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [touched, setTouched] = useState({ email: false, password: false, code: false });
  const [submitError, setSubmitError] = useState<string | null>(null);

  const fieldErrors = useMemo(() => {
    const e: { email?: string; password?: string; code?: string } = {};
    if (signIn.status !== "needs_client_trust") {
      if (touched.email) {
        if (!emailAddress.trim()) e.email = "Email is required.";
        else if (!isValidEmail(emailAddress)) e.email = "Enter a valid email.";
      }
      if (touched.password) {
        if (!password) e.password = "Password is required.";
        else if (password.length < 8) e.password = "Use at least 8 characters.";
      }
    } else if (touched.code) {
      if (!code.trim()) e.code = "Code is required.";
      else if (code.trim().length < 4) e.code = "Enter the full code.";
    }
    return e;
  }, [code, emailAddress, password, signIn.status, touched.code, touched.email, touched.password]);

  const isBusy = fetchStatus === "fetching";

  const canSubmit =
    !isBusy &&
    isValidEmail(emailAddress) &&
    password.length >= 8 &&
    !fieldErrors.email &&
    !fieldErrors.password;

  const canVerify = !isBusy && code.trim().length >= 4 && !fieldErrors.code;

  const finalizeToTabs = async () => {
    await signIn.finalize({
      navigate: ({ session, decorateUrl }) => {
        if (session?.currentTask) return;
        const url = decorateUrl("/(tabs)");
        if (url.startsWith("http")) {
          window.location.href = url;
        } else {
          router.push(url as Href);
        }
      },
    });
  };

  const handleSubmit = async () => {
    setTouched({ email: true, password: true, code: false });
    setSubmitError(null);
    if (!canSubmit) return;

    const { error } = await signIn.password({
      emailAddress: emailAddress.trim(),
      password,
    });

    if (error) {
      setSubmitError("We couldn’t sign you in. Please check your details and try again.");
      return;
    }

    if (signIn.status === "complete") {
      await finalizeToTabs();
      return;
    }

    if (signIn.status === "needs_client_trust") {
      const emailCodeFactor = signIn.supportedSecondFactors.find(
        (factor) => factor.strategy === "email_code",
      );
      if (emailCodeFactor) {
        try {
          await signIn.mfa.sendEmailCode();
        } catch {
          setSubmitError("We couldn't send the verification code. Please try again.");
        }
      } else {
        setSubmitError("Additional verification is required. Please try again.");
      }
      return;
    }

    setSubmitError("Sign-in wasn’t completed. Please try again.");
  };

  const handleVerify = async () => {
    setTouched({ email: true, password: true, code: true });
    setSubmitError(null);
    if (!canVerify) return;

    try {
      const result = await signIn.mfa.verifyEmailCode({ code: code.trim() });
      if (result?.error) {
        setSubmitError(result.error.message ?? "That code didn't work. Please try again.");
        return;
      }
      if (signIn.status === "complete") {
        await finalizeToTabs();
      } else {
        setSubmitError("That code didn't work. Please try again.");
      }
    } catch {
      setSubmitError("That code didn't work. Please try again.");
    }
  };

  const handleResendCode = async () => {
    setSubmitError(null);
    try {
      // Some Clerk builds surface resend errors by throwing; others return a payload.
      const result = await signIn.mfa.sendEmailCode();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const maybeError = (result as any)?.error;
      if (maybeError) {
        setSubmitError("We couldn’t resend the code. Please try again.");
      }
    } catch {
      setSubmitError("We couldn’t resend the code. Please try again.");
    }
  };

  if (signIn.status === "needs_client_trust") {
    return (
      <SafeScreen className="auth-safe-area">
        <KeyboardAvoidingView
          className="auth-screen"
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            className="auth-scroll"
            keyboardShouldPersistTaps="handled"
            contentContainerClassName="auth-content"
          >
            <View className="auth-brand-block">
              <View className="auth-logo-wrap">
                <View className="auth-logo-mark">
                  <Text className="auth-logo-mark-text">T</Text>
                </View>
                <View>
                  <Text className="auth-wordmark">Teorify</Text>
                  <Text className="auth-wordmark-sub">
                    Clear spending, calmer decisions
                  </Text>
                </View>
              </View>

              <Text className="auth-title">Verify your account</Text>
              <Text className="auth-subtitle">
                Enter the code we sent to your email to finish signing in.
              </Text>
            </View>

            <View className="auth-card">
              <View className="auth-form">
                <View className="auth-field">
                  <Text className="auth-label">Verification code</Text>
                  <TextInput
                    value={code}
                    onChangeText={setCode}
                    onBlur={() => setTouched((t) => ({ ...t, code: true }))}
                    keyboardType="number-pad"
                    placeholder="Code from your email"
                    placeholderTextColor="rgba(0, 0, 0, 0.35)"
                    className={[
                      "auth-input",
                      fieldErrors.code ? "auth-input-error" : null,
                    ].join(" ")}
                  />
                  {(fieldErrors.code || errors.fields.code?.message) && (
                    <Text className="auth-error">
                      {fieldErrors.code ?? errors.fields.code?.message}
                    </Text>
                  )}
                </View>

                {!!submitError && <Text className="auth-error">{submitError}</Text>}

                <Pressable
                  className={[
                    "auth-button",
                    !canVerify ? "auth-button-disabled" : null,
                  ].join(" ")}
                  onPress={handleVerify}
                  disabled={!canVerify}
                >
                  {isBusy ? (
                    <ActivityIndicator color="#081126" />
                  ) : (
                    <Text className="auth-button-text">Verify</Text>
                  )}
                </Pressable>

                <Pressable
                  className="auth-secondary-button"
                  onPress={handleResendCode}
                  disabled={isBusy}
                >
                  <Text className="auth-secondary-button-text">Send a new code</Text>
                </Pressable>

                <Pressable
                  className="auth-secondary-button"
                  onPress={() => signIn.reset()}
                  disabled={isBusy}
                >
                  <Text className="auth-secondary-button-text">Start over</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeScreen>
    );
  }

  return (
    <SafeScreen className="auth-safe-area">
      <KeyboardAvoidingView
        className="auth-screen"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          className="auth-scroll"
          keyboardShouldPersistTaps="handled"
          contentContainerClassName="auth-content"
        >
          <View className="auth-brand-block">
            <View className="auth-logo-wrap">
              <View className="auth-logo-mark">
                <Text className="auth-logo-mark-text">T</Text>
              </View>
              <View>
                <Text className="auth-wordmark">Teorify</Text>
                <Text className="auth-wordmark-sub">
                  Clear spending, calmer decisions
                </Text>
              </View>
            </View>

            <Text className="auth-title">Welcome back</Text>
            <Text className="auth-subtitle">
              Sign in to keep your subscriptions tidy and your insights up-to-date.
            </Text>
          </View>

          <View className="auth-card">
            <View className="auth-form">
              <View className="auth-field">
                <Text className="auth-label">Email</Text>
                <TextInput
                  value={emailAddress}
                  onChangeText={setEmailAddress}
                  onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  placeholder="name@domain.com"
                  placeholderTextColor="rgba(0, 0, 0, 0.35)"
                  className={[
                    "auth-input",
                    fieldErrors.email || errors.fields.identifier?.message
                      ? "auth-input-error"
                      : null,
                  ].join(" ")}
                />
                {(fieldErrors.email || errors.fields.identifier?.message) && (
                  <Text className="auth-error">
                    {fieldErrors.email ?? errors.fields.identifier?.message}
                  </Text>
                )}
              </View>

              <View className="auth-field">
                <Text className="auth-label">Password</Text>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                  secureTextEntry
                  placeholder="Your password"
                  placeholderTextColor="rgba(0, 0, 0, 0.35)"
                  className={[
                    "auth-input",
                    fieldErrors.password || errors.fields.password?.message
                      ? "auth-input-error"
                      : null,
                  ].join(" ")}
                />
                {(fieldErrors.password || errors.fields.password?.message) && (
                  <Text className="auth-error">
                    {fieldErrors.password ?? errors.fields.password?.message}
                  </Text>
                )}
              </View>

              {!!submitError && <Text className="auth-error">{submitError}</Text>}

              <Pressable
                className={[
                  "auth-button",
                  !canSubmit ? "auth-button-disabled" : null,
                ].join(" ")}
                onPress={handleSubmit}
                disabled={!canSubmit}
              >
                {isBusy ? (
                  <ActivityIndicator color="#081126" />
                ) : (
                  <Text className="auth-button-text">Sign in</Text>
                )}
              </Pressable>

              <View className="auth-divider-row">
                <View className="auth-divider-line" />
                <Text className="auth-divider-text">new here?</Text>
                <View className="auth-divider-line" />
              </View>

              <Link href="/(auth)/sign-up" asChild>
                <Pressable className="auth-secondary-button">
                  <Text className="auth-secondary-button-text">Create an account</Text>
                </Pressable>
              </Link>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeScreen>
  );
}