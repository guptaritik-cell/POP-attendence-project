import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { AssetManagementClient } from "./AssetManagementClient";

export default async function AssetManagementPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return <AssetManagementClient />;
}
