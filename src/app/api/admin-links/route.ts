import { NextRequest, NextResponse } from "next/server";
import { getAdminLinks, addAdminLink, removeAdminLink } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const adminId = searchParams.get("admin_id");
    const channelId = searchParams.get("channel_id");

    if (!adminId) {
      return NextResponse.json({ error: "admin_id is required" }, { status: 400 });
    }

    const links = await getAdminLinks(Number(adminId), channelId ? Number(channelId) : undefined);
    return NextResponse.json(links);
  } catch (error) {
    console.error("Error fetching admin links:", error);
    return NextResponse.json({ error: "Failed to fetch admin links" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { admin_id, channel_id, link_code, link_url } = body;

    if (!admin_id || !channel_id || !link_code || !link_url) {
      return NextResponse.json({ error: "admin_id, channel_id, link_code, and link_url are required" }, { status: 400 });
    }

    await addAdminLink(Number(admin_id), Number(channel_id), link_code, link_url);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error adding admin link:", error);
    return NextResponse.json({ error: "Failed to add admin link" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const adminId = searchParams.get("admin_id");
    const channelId = searchParams.get("channel_id");
    const linkCode = searchParams.get("link_code");

    if (!adminId || !channelId || !linkCode) {
      return NextResponse.json({ error: "admin_id, channel_id, and link_code are required" }, { status: 400 });
    }

    await removeAdminLink(Number(adminId), Number(channelId), linkCode);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error removing admin link:", error);
    return NextResponse.json({ error: "Failed to remove admin link" }, { status: 500 });
  }
}
