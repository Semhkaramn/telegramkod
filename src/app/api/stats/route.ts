import { NextResponse } from "next/server";
import { getTotalStats, getAllChannels, getListeningChannels, getAllAdmins } from "@/lib/db";

export async function GET() {
  try {
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
