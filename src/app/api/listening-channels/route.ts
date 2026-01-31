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
    const { channel_id, default_link = 'https://example.com' } = body;

    if (!channel_id) {
      return NextResponse.json({ error: "channel_id is required" }, { status: 400 });
    }

    // Varsayılan olarak KAPALI (isActive: false)
    await addListeningChannel(Number(channel_id), undefined, default_link, undefined, undefined, undefined, false);
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
    const { channel_id, channel_name, default_link, keyword, type, triggers, is_active } = body;

    if (!channel_id) {
      return NextResponse.json({ error: "channel_id is required" }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};
    if (channel_name !== undefined) updateData.channelName = channel_name;
    if (default_link !== undefined) updateData.defaultLink = default_link;
    if (keyword !== undefined) updateData.keyword = keyword;
    if (type !== undefined) updateData.type = type;
    if (triggers !== undefined) updateData.triggers = triggers;
    if (is_active !== undefined) updateData.isActive = is_active;

    await updateListeningChannel(Number(channel_id), updateData);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating listening channel:", error);
    return NextResponse.json({ error: "Failed to update listening channel" }, { status: 500 });
  }
}
