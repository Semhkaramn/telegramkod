import { NextRequest, NextResponse } from "next/server";
import { getAllBannedWords, addBannedWord, removeBannedWord } from "@/lib/db";

export async function GET() {
  try {
    const words = await getAllBannedWords();
    return NextResponse.json(words);
  } catch (error) {
    console.error("Error fetching banned words:", error);
    return NextResponse.json({ error: "Failed to fetch banned words" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { word } = body;

    if (!word) {
      return NextResponse.json({ error: "word is required" }, { status: 400 });
    }

    await addBannedWord(word);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error adding banned word:", error);
    return NextResponse.json({ error: "Failed to add banned word" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    await removeBannedWord(Number(id));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error removing banned word:", error);
    return NextResponse.json({ error: "Failed to remove banned word" }, { status: 500 });
  }
}
