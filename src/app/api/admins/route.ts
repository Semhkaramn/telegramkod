import { NextRequest, NextResponse } from "next/server";
import { getAllAdmins, addAdmin, removeAdmin, getChannelAdmins } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const channelId = searchParams.get("channel_id");

    if (channelId) {
      const admins = await getChannelAdmins(channelId);
      return NextResponse.json(admins);
    }

    const admins = await getAllAdmins();
    return NextResponse.json(admins);
  } catch (error) {
    console.error("Error fetching admins:", error);
    return NextResponse.json({ error: "Failed to fetch admins" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { channel_id, admin_id, admin_username, admin_type = 'ana' } = body;

    if (!channel_id || !admin_id) {
      return NextResponse.json({ error: "channel_id and admin_id are required" }, { status: 400 });
    }

    await addAdmin(Number(channel_id), Number(admin_id), admin_username || null, admin_type);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error adding admin:", error);
    return NextResponse.json({ error: "Failed to add admin" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const channelId = searchParams.get("channel_id");
    const adminId = searchParams.get("admin_id");

    if (!channelId || !adminId) {
      return NextResponse.json({ error: "channel_id and admin_id are required" }, { status: 400 });
    }

    await removeAdmin(Number(channelId), Number(adminId));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error removing admin:", error);
    return NextResponse.json({ error: "Failed to remove admin" }, { status: 500 });
  }
}
