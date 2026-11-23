import Shell from "@/components/Shell";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function LenboxLayout({ children }: { children: React.ReactNode }) {
  return <Shell companyName={(await getSettings()).companyName}>{children}</Shell>;
}
