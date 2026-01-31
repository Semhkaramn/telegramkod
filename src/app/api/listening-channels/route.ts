import { NextRequest, NextResponse } from "next/server";
import { getListeningChannels, addListeningChannel, removeListeningChannel, updateListeningChannel } from "@/lib/db";

export async function GET() {
  try {
    const channels = await getListeningChannels();
    return NextResponse.json(channels);
  } catch (error) {
    console.error("Error fetching listening channels:", error);
    return NextResponse.json({ error: "Failed to fetch listening channels" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { channel_id, channel_name } = body;

    if (!channel_id) {
      return NextResponse.json({ error: "channel_id is required" }, { status: 400 });
    }

    // Dinleme kanalı ekle - sadece channel_id ve channel_name gerekli
    await addListeningChannel(Number(channel_id), channel_name || undefined);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error adding listening channel:", error);
    return NextResponse.json({ error: "Failed to add listening channel" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const channelId = searchParams.get("channel_id");

    if (!channelId) {
      return NextResponse.json({ error: "channel_id is required" }, { status: 400 });
    }

    await removeListeningChannel(Number(channelId));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error removing listening channel:", error);
    return NextResponse.json({ error: "Failed to remove listening channel" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { channel_id, channel_name } = body;

    if (!channel_id) {
      return NextResponse.json({ error: "channel_id is required" }, { status: 400 });
    }

    // Sadece channel_name güncellenebilir
    const updateData: Record<string, unknown> = {};
    if (channel_name !== undefined) updateData.channelName = channel_name;

    await updateListeningChannel(Number(channel_id), updateData);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating listening channel:", error);
    return NextResponse.json({ error: "Failed to update listening channel" }, { status: 500 });
  }
}
