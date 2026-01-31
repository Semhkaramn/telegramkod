import { NextResponse } from "next/server";
import { getTotalStats, getAllChannels, getListeningChannels, getAllAdmins } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET() {
  try {
    const session = await getSession();
    if (!session || session.role !== "superadmin") {
      return NextResponse.json({ error: "Yetkisiz erisim" }, { status: 403 });
    }

    const stats = await getTotalStats();
    const channels = await getAllChannels();
    const listeningChannels = await getListeningChannels();
    const admins = await getAllAdmins();

    const activeChannels = channels.filter(c => !c.paused).length;
    const pausedChannels = channels.filter(c => c.paused).length;

    return NextResponse.json({
      codes: stats,
      channels: {
        total: channels.length,
        active: activeChannels,
        paused: pausedChannels,
      },
      listeningChannels: listeningChannels.length,
      admins: admins.length,
    });
  } catch (error) {
    console.error("Error fetching stats:", error);
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}
