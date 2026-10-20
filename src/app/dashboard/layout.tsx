import { Geist, JetBrains_Mono } from "next/font/google";

const geist = Geist({ subsets: ["latin"], variable: "--font-workspace-sans" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-workspace-mono" });

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${geist.variable} ${mono.variable}`}>{children}</div>;
}
