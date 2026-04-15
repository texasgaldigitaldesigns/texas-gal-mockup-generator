"use client";

import AuthGate from "../src/AuthGate";
import MockupPage from "./mockup-generator/page";

export default function Page() {
  return (
    <AuthGate
      appName="Texas Gal Mockup & Word Designer"
      subtitle="Enter your approved email to access your mockup generator."
      badgeText="TG"
      primaryColor="#5e6ad2"
      primaryColorDisabled="#9aa3e8"
      titleColor="#374151"
      subtitleColor="#6b7280"
      backgroundGradient="linear-gradient(180deg, #f5f7ff 0%, #e9eefc 100%)"
      cardBorderColor="#dbe3ff"
      inputBorderColor="#cfd8ff"
      headerBorderColor="#dbe3ff"
    >
      <MockupPage />
    </AuthGate>
  );
}