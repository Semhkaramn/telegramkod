import { NextRequest, NextResponse } from "next/server";
import { getAllChannels, addChannel, removeChannel, setChannelPause, getChannelAdmins, getDailyStats, getWeeklyStats, getMonthlyStats } from "@/lib/db";

export async function GET() {
  try {
    const channels = await getAllChannels();

    // Get additional info for each channel
    const channelsWithDetails = await Promise.all(
      channels.map(async (channel) => {
        const admins = await getChannelAdmins(channel.channel_id);
        const daily = await getDailyStats(channel.channel_id);
        const weekly = await getWeeklyStats(channel.channel_id);
        const monthly = await getMonthlyStats(channel.channel_id);

        return {
          ...channel,
          admins,
          stats: {
            daily: daily.daily_count,
            weekly,
            monthly,
          },
        };
      })
    );

    return NextResponse.json(channelsWithDetails);
  } catch (error) {
    console.error("Error fetching channels:", error);
    return NextResponse.json({ error: "Failed to fetch channels" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { channel_id } = body;

    if (!channel_id) {
      return NextResponse.json({ error: "channel_id is required" }, { status: 400 });
    }

    await addChannel(Number(channel_id));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error adding channel:", error);
    return NextResponse.json({ error: "Failed to add channel" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const channelId = searchParams.get("channel_id");

    if (!channelId) {
      return NextResponse.json({ error: "channel_id is required" }, { status: 400 });
    }

    await removeChannel(Number(channelId));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error removing channel:", error);
    return NextResponse.json({ error: "Failed to remove channel" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { channel_id, paused } = body;

    if (!channel_id || paused === undefined) {
      return NextResponse.json({ error: "channel_id and paused are required" }, { status: 400 });
    }

    await setChannelPause(Number(channel_id), Boolean(paused));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating channel:", error);
    return NextResponse.json({ error: "Failed to update channel" }, { status: 500 });
  }
}
