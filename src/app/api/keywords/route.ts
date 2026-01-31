import { NextRequest, NextResponse } from "next/server";
import { getAllKeywords, addKeyword, removeKeyword } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { invalidateCache } from "@/lib/cache";

export async function GET() {
  try {
    const session = await getSession();
    if (!session || session.role !== "superadmin") {
      return NextResponse.json({ error: "Yetkisiz erisim" }, { status: 403 });
    }

    const keywords = await getAllKeywords();
    return NextResponse.json(keywords);
  } catch (error) {
    console.error("Error fetching keywords:", error);
    return NextResponse.json({ error: "Failed to fetch keywords" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== "superadmin") {
      return NextResponse.json({ error: "Yetkisiz erisim" }, { status: 403 });
    }

    const body = await request.json();
    const { keyword } = body;

    if (!keyword) {
      return NextResponse.json({ error: "keyword is required" }, { status: 400 });
    }

    await addKeyword(keyword);
    await invalidateCache();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error adding keyword:", error);
    return NextResponse.json({ error: "Failed to add keyword" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== "superadmin") {
      return NextResponse.json({ error: "Yetkisiz erisim" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    await removeKeyword(Number(id));
    await invalidateCache();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error removing keyword:", error);
    return NextResponse.json({ error: "Failed to remove keyword" }, { status: 500 });
  }
}
