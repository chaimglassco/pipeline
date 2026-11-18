import { Geist, Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";

const geist = Geist({ subsets: ["latin"], variable: "--font-workspace-sans" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-workspace-mono" });
// Audit Performance Summary type: Inter for text, Space Grotesk for headings and large numbers.
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-audit-sans" });
const grotesk = Space_Grotesk({ subsets: ["latin"], weight: ["600"], variable: "--font-audit-display" });

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${geist.variable} ${mono.variable} ${inter.variable} ${grotesk.variable}`}>{children}</div>;
}
