"use client";
import { jsx, jsxs } from "react/jsx-runtime";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { confirmPasswordReset } from "../password-reset-actions.js";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "./ui/card";
function ResetPasswordForm({ token }) {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const tooShort = newPassword.length > 0 && newPassword.length < 8;
  const mismatch = confirmPassword.length > 0 && confirmPassword !== newPassword;
  const canSubmit = newPassword.length >= 8 && newPassword === confirmPassword && !loading;
  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await confirmPasswordReset(token, newPassword);
      if (result?.error) setError(result.error);
      else setSubmitted(true);
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }
  if (!token) {
    return /* @__PURE__ */ jsxs(Card, { className: "w-full max-w-sm", children: [
      /* @__PURE__ */ jsxs(CardHeader, { children: [
        /* @__PURE__ */ jsx(CardTitle, { children: "Reset link is missing" }),
        /* @__PURE__ */ jsx(CardDescription, { children: "This reset link is incomplete. Request a new one from the sign-in page." })
      ] }),
      /* @__PURE__ */ jsx(CardContent, { children: /* @__PURE__ */ jsx(Link, { href: "/forgot-password", className: "text-sm text-muted-foreground hover:text-foreground", children: "Request a new link" }) })
    ] });
  }
  if (submitted) {
    return /* @__PURE__ */ jsxs(Card, { className: "w-full max-w-sm", children: [
      /* @__PURE__ */ jsxs(CardHeader, { children: [
        /* @__PURE__ */ jsx(CardTitle, { children: "Password updated" }),
        /* @__PURE__ */ jsx(CardDescription, { children: "Use your new password to sign in." })
      ] }),
      /* @__PURE__ */ jsx(CardContent, { children: /* @__PURE__ */ jsx(Button, { className: "w-full", onClick: () => router.push("/login"), children: "Go to sign in" }) })
    ] });
  }
  return /* @__PURE__ */ jsxs(Card, { className: "w-full max-w-sm", children: [
    /* @__PURE__ */ jsxs(CardHeader, { children: [
      /* @__PURE__ */ jsx(CardTitle, { children: "Choose a new password" }),
      /* @__PURE__ */ jsx(CardDescription, { children: "Minimum 8 characters." })
    ] }),
    /* @__PURE__ */ jsx(CardContent, { children: /* @__PURE__ */ jsxs("form", { onSubmit: handleSubmit, className: "space-y-4", children: [
      /* @__PURE__ */ jsxs("div", { className: "space-y-2", children: [
        /* @__PURE__ */ jsx(Label, { htmlFor: "new-password", children: "New password" }),
        /* @__PURE__ */ jsx(
          Input,
          {
            id: "new-password",
            type: "password",
            autoComplete: "new-password",
            value: newPassword,
            onChange: (e) => setNewPassword(e.target.value),
            required: true,
            autoFocus: true
          }
        ),
        tooShort && /* @__PURE__ */ jsx("p", { className: "text-xs text-destructive", children: "At least 8 characters." })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "space-y-2", children: [
        /* @__PURE__ */ jsx(Label, { htmlFor: "confirm-password", children: "Confirm new password" }),
        /* @__PURE__ */ jsx(
          Input,
          {
            id: "confirm-password",
            type: "password",
            autoComplete: "new-password",
            value: confirmPassword,
            onChange: (e) => setConfirmPassword(e.target.value),
            required: true
          }
        ),
        mismatch && /* @__PURE__ */ jsx("p", { className: "text-xs text-destructive", children: "Passwords don't match." })
      ] }),
      error && /* @__PURE__ */ jsx("p", { className: "text-sm text-destructive", children: error }),
      /* @__PURE__ */ jsx(Button, { type: "submit", className: "w-full", disabled: !canSubmit, children: loading ? "Saving\u2026" : "Set new password" })
    ] }) })
  ] });
}
export {
  ResetPasswordForm
};
