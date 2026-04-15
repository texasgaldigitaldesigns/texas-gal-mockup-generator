"use client";

import AuthGate from "../src/AuthGate";
import TexasGalGeneratorApp from "../src/TexasGalGeneratorApp";

export default function Page() {
  return (
    <AuthGate>
      <TexasGalGeneratorApp />
    </AuthGate>
  );
}