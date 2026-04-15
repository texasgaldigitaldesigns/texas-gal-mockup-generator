"use client";

import AuthGate from "../src/AuthGate";
import MockupPage from "./mockup-generator/page";

export default function Page() {
  return (
    <AuthGate>
      <MockupPage />
    </AuthGate>
  );
}