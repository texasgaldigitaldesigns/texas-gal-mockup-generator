"use client";

import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

type AuthGateProps = {
  children: React.ReactNode;
  appName?: string;
  subtitle?: string;
  badgeText?: string;
  primaryColor?: string;
  primaryColorDisabled?: string;
  titleColor?: string;
  subtitleColor?: string;
  backgroundGradient?: string;
  cardBorderColor?: string;
  inputBorderColor?: string;
  headerBorderColor?: string;
};

export default function AuthGate({
  children,
  appName = "Texas Gal Alphabet Generator",
  subtitle = "Enter your approved email to receive your secure login link.",
  badgeText = "TG",
  primaryColor = "#c98668",
  primaryColorDisabled = "#d8b7a8",
  titleColor = "#7d5a50",
  subtitleColor = "#9a776b",
  backgroundGradient = "linear-gradient(180deg, #fff8f4 0%, #fff2ea 100%)",
  cardBorderColor = "#f0ddd2",
  inputBorderColor = "#e8d4c7",
  headerBorderColor = "#ead7cb",
}: AuthGateProps) {
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [emailInput, setEmailInput] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let mounted = true;

    const checkUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!mounted) return;

      if (!user?.email) {
        setUserEmail(null);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("approved_mockup_users")
        .select("email")
        .eq("email", user.email)
        .maybeSingle();

      if (error || !data) {
        await supabase.auth.signOut();
        if (!mounted) return;
        setUserEmail(null);
        setMessage("This email is not approved to use the app.");
        setLoading(false);
        return;
      }

      setUserEmail(user.email);
      setLoading(false);
    };

    checkUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      checkUser();
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleLogin = async () => {
    const cleanEmail = emailInput.trim().toLowerCase();

    if (!cleanEmail) {
      setMessage("Please enter your email address.");
      return;
    }

    setSending(true);
    setMessage("");

    const redirectTo =
      typeof window !== "undefined" ? window.location.origin : undefined;

    const { error } = await supabase.auth.signInWithOtp({
      email: cleanEmail,
      options: {
        emailRedirectTo: redirectTo,
      },
    });

    if (error) {
      setMessage(error.message || "Could not send login link.");
    } else {
      setMessage("Check your email for your login link.");
    }

    setSending(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUserEmail(null);
    setMessage("");
  };

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: backgroundGradient,
          color: titleColor,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 600 }}>Loading...</div>
      </div>
    );
  }

  if (!userEmail) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: backgroundGradient,
          padding: 24,
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 460,
            background: "#ffffff",
            borderRadius: 24,
            padding: 32,
            boxShadow: "0 20px 50px rgba(0,0,0,0.08)",
            border: `1px solid ${cardBorderColor}`,
          }}
        >
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 20,
              margin: "0 auto 20px",
              display: "grid",
              placeItems: "center",
              background: `linear-gradient(135deg, ${primaryColorDisabled} 0%, ${primaryColor} 100%)`,
              color: "#fff",
              fontSize: 28,
              fontWeight: 700,
            }}
          >
            {badgeText}
          </div>

          <h1
            style={{
              textAlign: "center",
              fontSize: 32,
              lineHeight: 1.15,
              margin: "0 0 10px",
              color: titleColor,
            }}
          >
            {appName}
          </h1>

          <p
            style={{
              textAlign: "center",
              color: subtitleColor,
              margin: "0 0 24px",
              fontSize: 15,
              lineHeight: 1.5,
            }}
          >
            {subtitle}
          </p>

          <input
            type="email"
            placeholder="Enter your email"
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            style={{
              width: "100%",
              padding: "14px 16px",
              borderRadius: 14,
              border: `1px solid ${inputBorderColor}`,
              outline: "none",
              fontSize: 16,
              marginBottom: 14,
              boxSizing: "border-box",
            }}
          />

          <button
            onClick={handleLogin}
            disabled={sending}
            style={{
              width: "100%",
              padding: "14px 16px",
              borderRadius: 14,
              border: "none",
              background: sending ? primaryColorDisabled : primaryColor,
              color: "#fff",
              fontSize: 16,
              fontWeight: 700,
              cursor: sending ? "default" : "pointer",
            }}
          >
            {sending ? "Sending..." : "Send Login Link"}
          </button>

          {message ? (
            <p
              style={{
                marginTop: 14,
                textAlign: "center",
                color: subtitleColor,
                fontSize: 14,
                lineHeight: 1.5,
              }}
            >
              {message}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh" }}>
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          padding: "12px 18px",
          background: "rgba(255,255,255,0.92)",
          borderBottom: `1px solid ${headerBorderColor}`,
          backdropFilter: "blur(8px)",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, color: titleColor }}>{appName}</div>
          <div
            style={{
              fontSize: 12,
              color: subtitleColor,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: 280,
            }}
          >
            Signed in as {userEmail}
          </div>
        </div>

        <button
          onClick={handleLogout}
          style={{
            padding: "10px 14px",
            borderRadius: 12,
            border: "none",
            background: primaryColor,
            color: "#fff",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Log Out
        </button>
      </div>

      {children}
    </div>
  );
}