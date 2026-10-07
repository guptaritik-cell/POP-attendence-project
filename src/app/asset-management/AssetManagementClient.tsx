"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const TARGET_URL =
  process.env.NEXT_PUBLIC_ASSET_MANAGEMENT_URL ||
  "https://example.com/pop-asset-management";

export function AssetManagementClient() {
  const [isLoading, setIsLoading] = useState(true);

  return (
    <div className="flex flex-col h-screen w-screen bg-[#0D0D0D] overflow-hidden">
      {/* Top Bar / Header with navigation */}
      <header className="flex items-center justify-between px-6 py-3 bg-[#181818] border-b border-[rgba(255,77,0,0.18)] z-10 text-white">
        <div className="flex items-center gap-4">
          <Link href="/home">
            <Button
              variant="outline"
              size="sm"
              className="border-[rgba(255,77,0,0.3)] bg-transparent text-white hover:bg-[rgba(255,77,0,0.1)] hover:text-[#FF7A35]"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Workspace
            </Button>
          </Link>
          <h1 className="text-lg font-bold text-[#F5F5F5] hidden sm:block">
            POP Asset Management
          </h1>
        </div>

        <div className="text-xs text-muted-foreground font-mono bg-[#111] px-3 py-1 rounded-md border border-white/10">
          /asset-management
        </div>
      </header>

      {/* Main Content Area: Masked Iframe */}
      <div className="relative flex-1 w-full h-full bg-[#0D0D0D]">
        {isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/70 bg-[#0D0D0D]">
            <Loader2 className="w-8 h-8 animate-spin text-[#FF4D00]" />
            <p className="text-sm">Loading Asset Management...</p>
          </div>
        )}

        <iframe
          src={TARGET_URL}
          title="POP Asset Management"
          className="w-full h-full border-0"
          onLoad={() => setIsLoading(false)}
        />
      </div>
    </div>
  );
}
