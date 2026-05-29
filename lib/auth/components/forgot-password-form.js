"use client";
import { jsx, jsxs } from "react/jsx-runtime";
import { useState } from "react";
import Link from "next/link";
import { requestPasswordReset } from "../password-reset-actions.js";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "./ui/card";
function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await requestPasswordReset(email);
      if (result?.error) {
        setError(result.error);
      } else {
        setSubmitted(true);
      }
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }
  if (submitted) {
    return /* @__PURE__ */ jsxs(Card, { className: "w-full max-w-sm", children: [
      /* @__PURE__ */ jsxs(CardHeader, { children: [
        /* @__PURE__ */ jsx(CardTitle, { children: "Check your email" }),
        /* @__PURE__ */ jsx(CardDescription, { children: "If an account exists for that address, a reset link is on its way. The link is valid for 1 hour." })
      ] }),
      /* @__PURE__ */ jsx(CardContent, { children: /* @__PURE__ */ jsx(Link, { href: "/login", className: "text-sm text-muted-foreground hover:text-foreground", children: "Back to sign in" }) })
    ] });
  }
  return /* @__PURE__ */ jsxs(Card, { className: "w-full max-w-sm", children: [
    /* @__PURE__ */ jsxs(CardHeader, { children: [
      /* @__PURE__ */ jsx(CardTitle, { children: "Forgot your password?" }),
      /* @__PURE__ */ jsx(CardDescription, { children: "Enter the email on your account and we'll send a reset link." })
    ] }),
    /* @__PURE__ */ jsx(CardContent, { children: /* @__PURE__ */ jsxs("form", { onSubmit: handleSubmit, className: "space-y-4", children: [
      /* @__PURE__ */ jsxs("div", { className: "space-y-2", children: [
        /* @__PURE__ */ jsx(Label, { htmlFor: "email", children: "Email" }),
        /* @__PURE__ */ jsx(
          Input,
          {
            id: "email",
            type: "email",
            autoComplete: "email",
            value: email,
            onChange: (e) => setEmail(e.target.value),
            required: true,
            autoFocus: true
          }
        )
      ] }),
      error && /* @__PURE__ */ jsx("p", { className: "text-sm text-destructive", children: error }),
      /* @__PURE__ */ jsx(Button, { type: "submit", className: "w-full", disabled: loading || !email, children: loading ? "Sending\u2026" : "Send reset link" }),
      /* @__PURE__ */ jsx(Link, { href: "/login", className: "block text-sm text-muted-foreground hover:text-foreground", children: "Back to sign in" })
    ] }) })
  ] });
}
export {
  ForgotPasswordForm
};
