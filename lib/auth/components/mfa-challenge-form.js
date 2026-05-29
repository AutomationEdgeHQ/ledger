"use client";
import { jsx, jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { completeMfaChallenge, requestEmailMfaCode } from "../mfa-actions.js";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "./ui/card";
const MODE_LABELS = {
  totp: "Authenticator code",
  email: "Emailed code",
  recovery: "Recovery code"
};
function MfaChallengeForm({ emailBackupAvailable }) {
  const router = useRouter();
  const [mode, setMode] = useState("totp");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  function switchMode(next) {
    setMode(next);
    setCode("");
    setError("");
    setInfo("");
  }
  async function sendEmail() {
    setError("");
    setInfo("");
    setSending(true);
    try {
      const result = await requestEmailMfaCode();
      if (result?.error) setError(result.error);
      else setInfo("Code sent \u2014 check your inbox.");
    } catch {
      setError("Could not send code.");
    } finally {
      setSending(false);
    }
  }
  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await completeMfaChallenge({ kind: mode, code });
      if (result?.error) {
        setError(result.error);
        return;
      }
      if (result?.recoveryCodesRemaining !== null && result?.recoveryCodesRemaining !== void 0) {
        router.push(`/?recovery=${result.recoveryCodesRemaining}`);
      } else {
        router.push("/");
      }
      router.refresh();
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }
  return /* @__PURE__ */ jsxs(Card, { className: "w-full max-w-sm", children: [
    /* @__PURE__ */ jsxs(CardHeader, { children: [
      /* @__PURE__ */ jsx(CardTitle, { children: "Two-factor verification" }),
      /* @__PURE__ */ jsx(CardDescription, { children: "Enter the code from your authenticator app to finish signing in." })
    ] }),
    /* @__PURE__ */ jsxs(CardContent, { children: [
      /* @__PURE__ */ jsxs("form", { onSubmit: handleSubmit, className: "space-y-4", children: [
        /* @__PURE__ */ jsxs("div", { className: "space-y-2", children: [
          /* @__PURE__ */ jsx(Label, { htmlFor: "mfa-code", children: MODE_LABELS[mode] }),
          /* @__PURE__ */ jsx(
            Input,
            {
              id: "mfa-code",
              type: "text",
              inputMode: mode === "recovery" ? "text" : "numeric",
              autoComplete: "one-time-code",
              placeholder: mode === "recovery" ? "XXXXX-XXXXX" : "123456",
              value: code,
              onChange: (e) => setCode(e.target.value),
              required: true,
              autoFocus: true
            }
          )
        ] }),
        error && /* @__PURE__ */ jsx("p", { className: "text-sm text-destructive", children: error }),
        info && /* @__PURE__ */ jsx("p", { className: "text-sm text-muted-foreground", children: info }),
        /* @__PURE__ */ jsx(Button, { type: "submit", className: "w-full", disabled: loading || !code, children: loading ? "Verifying\u2026" : "Verify" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "mt-4 space-y-2 text-sm", children: [
        mode !== "totp" && /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            className: "block w-full text-left text-muted-foreground hover:text-foreground",
            onClick: () => switchMode("totp"),
            children: "Use authenticator app instead"
          }
        ),
        mode !== "email" && emailBackupAvailable && /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            className: "block w-full text-left text-muted-foreground hover:text-foreground",
            onClick: async () => {
              switchMode("email");
              await sendEmail();
            },
            disabled: sending,
            children: sending ? "Sending email code\u2026" : "Email me a code instead"
          }
        ),
        mode === "email" && /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            className: "block w-full text-left text-muted-foreground hover:text-foreground",
            onClick: sendEmail,
            disabled: sending,
            children: sending ? "Resending\u2026" : "Resend email code"
          }
        ),
        mode !== "recovery" && /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            className: "block w-full text-left text-muted-foreground hover:text-foreground",
            onClick: () => switchMode("recovery"),
            children: "Use a recovery code instead"
          }
        ),
        /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            className: "block w-full text-left text-muted-foreground hover:text-foreground",
            onClick: () => signOut({ callbackUrl: "/login" }),
            children: "Cancel and sign out"
          }
        )
      ] })
    ] })
  ] });
}
export {
  MfaChallengeForm
};
