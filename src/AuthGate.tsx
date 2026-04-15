"use client";

import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

type AuthGateProps = {
  children: React.ReactNode;
};

export default function AuthGate({ children }: AuthGateProps) {
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
        .from("approved_users")
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
          background: "linear-gradient(180deg, #fff8f4 0%, #fff2ea 100%)",
          color: "#7d5a50",
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
          background: "linear-gradient(180deg, #fff8f4 0%, #fff2ea 100%)",
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
            border: "1px solid #f0ddd2",
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
              background: "linear-gradient(135deg, #e8b9a2 0%, #d79678 100%)",
              color: "#fff",
              fontSize: 28,
              fontWeight: 700,
            }}
          >
            TG
          </div>

          <h1
            style={{
              textAlign: "center",
              fontSize: 32,
              lineHeight: 1.15,
              margin: "0 0 10px",
              color: "#7d5a50",
            }}
          >
            Texas Gal
            <br />
            Alphabet Generator
          </h1>

          <p
            style={{
              textAlign: "center",
              color: "#9a776b",
              margin: "0 0 24px",
              fontSize: 15,
              lineHeight: 1.5,
            }}
          >
            Enter your approved email to receive your secure login link.
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
              border: "1px solid #e8d4c7",
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
              background: sending ? "#d8b7a8" : "#c98668",
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
                color: "#8b685d",
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
          borderBottom: "1px solid #ead7cb",
          backdropFilter: "blur(8px)",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, color: "#7d5a50" }}>
            Texas Gal Alphabet Generator
          </div>
          <div
            style={{
              fontSize: 12,
              color: "#9a776b",
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
            background: "#c98668",
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