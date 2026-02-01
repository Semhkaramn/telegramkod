import { NextRequest, NextResponse } from "next/server";
import { getAllAdmins, addAdmin, removeAdmin, getChannelAdmins } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    // Yetki kontrolü - sadece superadmin erişebilir
    const session = await getSession();
    if (!session || session.role !== "superadmin") {
      return NextResponse.json({ error: "Yetkisiz erisim" }, { status: 403 });
    }

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
    return NextResponse.json({ error: "Admin listesi alinamadi" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    // Yetki kontrolü - sadece superadmin erişebilir
    const session = await getSession();
    if (!session || session.role !== "superadmin") {
      return NextResponse.json({ error: "Yetkisiz erisim" }, { status: 403 });
    }

    const body = await request.json();
    const { channel_id, admin_id, admin_username, admin_type = 'ana' } = body;

    if (!channel_id || !admin_id) {
      return NextResponse.json({ error: "channel_id ve admin_id gerekli" }, { status: 400 });
    }

    await addAdmin(Number(channel_id), Number(admin_id), admin_username || null, admin_type);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error adding admin:", error);
    return NextResponse.json({ error: "Admin eklenemedi" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // Yetki kontrolü - sadece superadmin erişebilir
    const session = await getSession();
    if (!session || session.role !== "superadmin") {
      return NextResponse.json({ error: "Yetkisiz erisim" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const channelId = searchParams.get("channel_id");
    const adminId = searchParams.get("admin_id");

    if (!channelId || !adminId) {
      return NextResponse.json({ error: "channel_id ve admin_id gerekli" }, { status: 400 });
    }

    await removeAdmin(Number(channelId), Number(adminId));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error removing admin:", error);
    return NextResponse.json({ error: "Admin silinemedi" }, { status: 500 });
  }
}
