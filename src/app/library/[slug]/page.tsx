import { ManagedReader } from "@/features/library/ui/managed-reader";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <div className="reader-page"><ManagedReader slug={slug} /></div>;
}
