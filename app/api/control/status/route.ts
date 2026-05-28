export const dynamic = 'force-dynamic';
import { NextResponse } from "next/server";
import { syncControlMode } from "@/lib/db";

export async function GET() {
  const control = syncControlMode();
  let pauseDuration: string | null = null;

  if (control.status === "paused" && control.paused_at) {
    const pausedMs = Date.now() - new Date(control.paused_at).getTime();
    const mins = Math.floor(pausedMs / 60000);
    const hrs = Math.floor(mins / 60);
    if (hrs > 0) {
      pauseDuration = `${hrs}h${mins % 60}m`;
    } else {
      pauseDuration = `${mins}m`;
    }
  }

  return NextResponse.json({ ...control, pauseDuration });
}
