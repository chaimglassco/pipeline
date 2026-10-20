import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { AppShell } from "@/components/app-shell";
import { GlasscoSessionProvider } from "@/components/glassco-session";
import { ReadingStateProvider } from "@/features/library/state/reading-state";
import "./globals.css";
import "./library-admin.css";

const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"] });
export const metadata: Metadata = { title: { default: "Glassco Library", template: "%s · Glassco" }, description: "Practical operating procedures for Amazon PPC teams." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en" data-scroll-behavior="smooth" className={jakarta.variable}><body><a className="skip-link" href="#main-content">Skip to content</a><GlasscoSessionProvider><ReadingStateProvider><AppShell>{children}</AppShell></ReadingStateProvider></GlasscoSessionProvider></body></html>; }
