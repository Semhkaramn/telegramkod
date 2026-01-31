import { NextRequest, NextResponse } from "next/server";
import { getAllKeywords, addKeyword, removeKeyword } from "@/lib/db";

export async function GET() {
  try {
    const keywords = await getAllKeywords();
    return NextResponse.json(keywords);
  } catch (error) {
    console.error("Error fetching keywords:", error);
    return NextResponse.json({ error: "Failed to fetch keywords" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { keyword } = body;

    if (!keyword) {
      return NextResponse.json({ error: "keyword is required" }, { status: 400 });
    }

    await addKeyword(keyword);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error adding keyword:", error);
    return NextResponse.json({ error: "Failed to add keyword" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const keyword = searchParams.get("keyword");

    if (!keyword) {
      return NextResponse.json({ error: "keyword is required" }, { status: 400 });
    }

    await removeKeyword(keyword);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error removing keyword:", error);
    return NextResponse.json({ error: "Failed to remove keyword" }, { status: 500 });
  }
}
