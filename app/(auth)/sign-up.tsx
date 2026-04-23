import { SafeScreen } from "@/components/SafeScreen";
import { useAuth, useSignUp } from "@clerk/expo";
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
 * Validates whether a string is a syntactically valid email address.
 *
 * @param value - The input string; leading and trailing whitespace are ignored before validation.
 * @returns `true` if the trimmed string matches a basic `local@domain.tld` email pattern, `false` otherwise.
 */
function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

type Step = "form" | "verify";

/**
 * Render the multi-step signup page that orchestrates user creation, email verification,
 * and any additional profile requirements using Clerk.
 *
 * The component manages local validation and UI state across the "form", "verify",
 * and "requirements" steps, invokes Clerk signUp methods to create accounts, send and
 * verify email codes, update missing profile fields, and finalizes navigation to the
 * app tabs when signup completes.
 *
 * @returns The signup page React element, or `null` when signup is already complete or the user is signed in.
 */
export default function Page() {
  const { signUp, errors, fetchStatus } = useSignUp();
  const { isSignedIn } = useAuth();
  const router = useRouter();

  const [step, setStep] = useState<Step | "requirements">("form");
  const [emailAddress, setEmailAddress] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [code, setCode] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [touched, setTouched] = useState({
    email: false,
    password: false,
    confirmPassword: false,
    code: false,
  });
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isBusy = fetchStatus === "fetching" || submitting;

  // Clerk-provided next requirements (exactly what you asked to display)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const missingFields = ((signUp as any)?.missingFields ?? []) as string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const unverifiedFields = ((signUp as any)?.unverifiedFields ?? []) as string[];
  const signUpStatus = String(signUp?.status ?? "unknown");

  const needsCaptcha =
    missingFields.includes("captcha") ||
    unverifiedFields.includes("captcha") ||
    signUpStatus.includes("captcha");

  function normalizePhoneToE164(input: string) {
    const raw = input.trim().replace(/\s+/g, "");
    if (!raw) return "";
    if (raw.startsWith("+")) return raw;
    // Best-effort: if user enters a Swedish-style local number starting with 0,
    // convert to +46… (matches the UI hint).
    if (raw.startsWith("0")) return `+46${raw.slice(1)}`;
    return raw;
  }

  const fieldErrors = useMemo(() => {
    const e: {
      email?: string;
      password?: string;
      confirmPassword?: string;
      code?: string;
    } = {};

    if (step === "form") {
      if (touched.email) {
        if (!emailAddress.trim()) e.email = "Email is required.";
        else if (!isValidEmail(emailAddress)) e.email = "Enter a valid email.";
      }
      if (touched.password) {
        if (!password) e.password = "Password is required.";
        else if (password.length < 8) e.password = "Use at least 8 characters.";
      }
      if (touched.confirmPassword) {
        if (!confirmPassword) e.confirmPassword = "Confirm your password.";
        else if (confirmPassword !== password) e.confirmPassword = "Passwords do not match.";
      }
    }

    if (step === "verify" && touched.code) {
      if (!code.trim()) e.code = "Code is required.";
      else if (code.trim().length < 4) e.code = "Enter the full code.";
    }

    return e;
  }, [
    code,
    confirmPassword,
    emailAddress,
    password,
    step,
    touched.code,
    touched.confirmPassword,
    touched.email,
    touched.password,
  ]);

  const canSubmit =
    !isBusy &&
    isValidEmail(emailAddress) &&
    password.length >= 8 &&
    confirmPassword === password &&
    !fieldErrors.email &&
    !fieldErrors.password &&
    !fieldErrors.confirmPassword;

  const canVerify = !isBusy && code.trim().length >= 4 && !fieldErrors.code;

  const finalizeToTabs = async () => {
    await signUp.finalize({
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
    setTouched((t) => ({ ...t, email: true, password: true, confirmPassword: true }));
    setSubmitError(null);
    if (!canSubmit) return;

    try {
      setSubmitting(true);
      const { error } = await signUp.password({
        emailAddress: emailAddress.trim(),
        password,
      });

      if (error) {
        setSubmitError(error.message ?? "We couldn’t create your account. Please try again.");
        return;
      }

      // Send a fresh code. Disable the CTA while doing this to avoid sending
      // multiple codes (which invalidates previous ones and feels “random”).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sendResult = (await signUp.verifications.sendEmailCode()) as any;
      if (sendResult?.error) {
        setSubmitError(
          sendResult.error?.message ??
            "We couldn’t send a verification code. Please try again.",
        );
        return;
      }

      setStep("verify");
    } catch {
      setSubmitError("We couldn’t create your account. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerify = async () => {
    setTouched((t) => ({ ...t, code: true }));
    setSubmitError(null);
    if (!canVerify) return;

    try {
      setSubmitting(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const verifyResult = (await signUp.verifications.verifyEmailCode({
        code: code.trim(),
      })) as any;

      if (verifyResult?.error) {
        setSubmitError(
          verifyResult.error?.message ?? "That code didn’t work. Please try again.",
        );
        return;
      }

      if (signUp.status === "complete") {
        await finalizeToTabs();
        return;
      }

      // Exact next requirement UI
      setStep("requirements");
    } catch {
      setSubmitError("That code didn’t work. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    setSubmitError(null);
    try {
      setSubmitting(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sendResult = (await signUp.verifications.sendEmailCode()) as any;
      if (sendResult?.error) {
        setSubmitError(
          sendResult.error?.message ?? "We couldn’t resend the code. Please try again.",
        );
      }
    } catch {
      setSubmitError("We couldn’t resend the code. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (signUp.status === "complete" || isSignedIn) {
    return null;
  }

  async function handleSubmitRequirements() {
    setSubmitError(null);
    try {
      setSubmitting(true);

      const payload: Record<string, string> = {};
      if (missingFields.includes("first_name") && firstName.trim())
        Object.assign(payload, { firstName: firstName.trim() });
      if (missingFields.includes("last_name") && lastName.trim())
        Object.assign(payload, { lastName: lastName.trim() });
      if (missingFields.includes("username") && username.trim())
        Object.assign(payload, { username: username.trim() });
      if (missingFields.includes("phone_number")) {
        const e164 = normalizePhoneToE164(phoneNumber);
        if (!e164 || !e164.startsWith("+")) {
          setSubmitError("Please enter your phone number with country code (e.g. +46…).");
          return;
        }
        Object.assign(payload, { phoneNumber: e164 });
      }

      // Clerk SDK supports signUp.update(...) to provide missing fields.
      // IMPORTANT: do not detach the method from the instance; it relies on `this`.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updater = (signUp as any)?.update as
        | ((p: Record<string, string>) => Promise<any>)
        | undefined;
      if (updater && Object.keys(payload).length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let res: any;
        try {
          res = await (signUp as any).update(payload);
        } catch (err) {
          // Workaround: some Clerk SDK builds occasionally throw a JSON parse error
          // even though the API request succeeded. In that case, try reloading the
          // resource and continuing based on the updated status/requirements.
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.toLowerCase().includes("json parse error")) {
            try {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              await (signUp as any).reload?.();
            } catch {
              // ignore
            }
          } else {
            throw err;
          }
        }

        if (res?.error) {
          setSubmitError(
            res.error?.message ??
              res.error?.longMessage ??
              "Please check your details and try again.",
          );
          return;
        }
      }

      if (signUp.status === "complete") {
        await finalizeToTabs();
        return;
      }

      // If Clerk says email still needs verification, return to verify step.
      if (unverifiedFields.includes("email_address")) {
        setStep("verify");
        return;
      }

      // Stay on requirements and show the exact current requirement state.
      setStep("requirements");
      setSubmitError(
        "We still need one more step. If this doesn’t match your Clerk dashboard, double-check you’re viewing the same environment as your publishable key (test vs production).",
      );
    } catch (err) {
      if (err instanceof Error && err.message) {
        if (err.message.toLowerCase().includes("json parse error")) {
          setSubmitError(
            "We couldn’t save your phone number due to a network response issue. Please try again (and avoid tapping twice).",
          );
        } else {
          setSubmitError(err.message);
        }
      } else {
        setSubmitError("We couldn’t complete the next step. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
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

            <Text className="auth-title">
              {step === "verify"
                ? "Verify your email"
                : step === "requirements"
                  ? "Finish setup"
                  : "Create your account"}
            </Text>
            <Text className="auth-subtitle">
              {step === "verify"
                ? "Enter the code we sent to your email. This helps keep your account safe."
                : step === "requirements"
                  ? "Clerk needs one more step to complete your account. We’ll show you exactly what’s missing."
                : "Use your email and a strong password. We’ll ask you to verify your email next."}
            </Text>
          </View>

          <View className="auth-card">
            <View className="auth-form">
              {step === "requirements" ? (
                <>
                  <View className="auth-field">
                    <Text className="auth-label">Next requirement</Text>
                    <Text className="auth-helper">
                      Status: <Text className="font-sans-bold">{signUpStatus}</Text>
                    </Text>
                    {!!missingFields.length && (
                      <Text className="auth-helper">
                        Missing:{" "}
                        <Text className="font-sans-bold">{missingFields.join(", ")}</Text>
                      </Text>
                    )}
                    {!!unverifiedFields.length && (
                      <Text className="auth-helper">
                        Unverified:{" "}
                        <Text className="font-sans-bold">
                          {unverifiedFields.join(", ")}
                        </Text>
                      </Text>
                    )}
                  </View>

                  {missingFields.includes("first_name") && (
                    <View className="auth-field">
                      <Text className="auth-label">First name</Text>
                      <TextInput
                        value={firstName}
                        onChangeText={setFirstName}
                        placeholder="Your first name"
                        placeholderTextColor="rgba(0, 0, 0, 0.35)"
                        className="auth-input"
                      />
                    </View>
                  )}

                  {missingFields.includes("last_name") && (
                    <View className="auth-field">
                      <Text className="auth-label">Last name</Text>
                      <TextInput
                        value={lastName}
                        onChangeText={setLastName}
                        placeholder="Your last name"
                        placeholderTextColor="rgba(0, 0, 0, 0.35)"
                        className="auth-input"
                      />
                    </View>
                  )}

                  {missingFields.includes("username") && (
                    <View className="auth-field">
                      <Text className="auth-label">Username</Text>
                      <TextInput
                        value={username}
                        onChangeText={setUsername}
                        autoCapitalize="none"
                        placeholder="Pick a username"
                        placeholderTextColor="rgba(0, 0, 0, 0.35)"
                        className="auth-input"
                      />
                    </View>
                  )}

                  {missingFields.includes("phone_number") && (
                    <View className="auth-field">
                      <Text className="auth-label">Phone number</Text>
                      <TextInput
                        value={phoneNumber}
                        onChangeText={setPhoneNumber}
                        keyboardType="phone-pad"
                        placeholder="+1 555 000 0000"
                        placeholderTextColor="rgba(0, 0, 0, 0.35)"
                        className="auth-input"
                      />
                      <Text className="auth-helper">
                        Include country code (e.g. +46…).
                      </Text>
                    </View>
                  )}

                  {needsCaptcha && (
                    <View className="auth-field">
                      <Text className="auth-label">Bot protection</Text>
                      <Text className="auth-helper">
                        Complete the captcha below to continue.
                      </Text>
                      <View
                        nativeID="clerk-captcha"
                        pointerEvents="auto"
                        className="mt-2 min-h-16"
                      />
                    </View>
                  )}

                  {!!submitError && <Text className="auth-error">{submitError}</Text>}

                  <Pressable
                    className={[
                      "auth-button",
                      isBusy ? "auth-button-disabled" : null,
                    ].join(" ")}
                    onPress={handleSubmitRequirements}
                    disabled={isBusy}
                  >
                    {isBusy ? (
                      <ActivityIndicator color="#081126" />
                    ) : (
                      <Text className="auth-button-text">Continue</Text>
                    )}
                  </Pressable>

                  <Pressable
                    className="auth-secondary-button"
                    onPress={() => {
                      // Give the user a safe way to restart the signup flow
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      (signUp as any)?.reset?.();
                      setStep("form");
                      setCode("");
                      setSubmitError(null);
                    }}
                    disabled={isBusy}
                  >
                    <Text className="auth-secondary-button-text">Start over</Text>
                  </Pressable>
                </>
              ) : step === "form" ? (
                <>
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
                        fieldErrors.email || errors.fields.emailAddress?.message
                          ? "auth-input-error"
                          : null,
                      ].join(" ")}
                    />
                    {(fieldErrors.email || errors.fields.emailAddress?.message) && (
                      <Text className="auth-error">
                        {fieldErrors.email ?? errors.fields.emailAddress?.message}
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
                      placeholder="At least 8 characters"
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

                  <View className="auth-field">
                    <Text className="auth-label">Confirm password</Text>
                    <TextInput
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      onBlur={() =>
                        setTouched((t) => ({ ...t, confirmPassword: true }))
                      }
                      secureTextEntry
                      placeholder="Repeat your password"
                      placeholderTextColor="rgba(0, 0, 0, 0.35)"
                      className={[
                        "auth-input",
                        fieldErrors.confirmPassword ? "auth-input-error" : null,
                      ].join(" ")}
                    />
                    {!!fieldErrors.confirmPassword && (
                      <Text className="auth-error">{fieldErrors.confirmPassword}</Text>
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
                      <Text className="auth-button-text">Continue</Text>
                    )}
                  </Pressable>

                  <View className="auth-link-row">
                    <Text className="auth-link-copy">Already have an account?</Text>
                    <Link href="/(auth)/sign-in" asChild>
                      <Pressable>
                        <Text className="auth-link">Sign in</Text>
                      </Pressable>
                    </Link>
                  </View>

                  <View nativeID="clerk-captcha" pointerEvents="box-none" className="h-0" />
                </>
              ) : (
                <>
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
                        fieldErrors.code || errors.fields.code?.message
                          ? "auth-input-error"
                          : null,
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
                      <Text className="auth-button-text">Verify & finish</Text>
                    )}
                  </Pressable>

                  <Pressable
                    className="auth-secondary-button"
                    onPress={handleResend}
                    disabled={isBusy}
                  >
                    <Text className="auth-secondary-button-text">Resend code</Text>
                  </Pressable>

                  <View className="auth-link-row">
                    <Text className="auth-link-copy">Wrong email?</Text>
                    <Pressable
                      onPress={() => {
                        setStep("form");
                        setCode("");
                        setSubmitError(null);
                      }}
                    >
                      <Text className="auth-link">Edit details</Text>
                    </Pressable>
                  </View>
                </>
              )}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeScreen>
  );
}