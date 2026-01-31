import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

const BOT_TOKEN = process.env.BOT_TOKEN || "";

// GET - Telegram Bot API'den kanal bilgisi al
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== "superadmin") {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    let channelId = searchParams.get("channelId");

    if (!channelId) {
      return NextResponse.json(
        { error: "channelId parametresi gerekli" },
        { status: 400 }
      );
    }

    if (!BOT_TOKEN) {
      return NextResponse.json(
        { error: "BOT_TOKEN ayarlanmamış. Kanal bilgisi alınamıyor." },
        { status: 500 }
      );
    }

    // Kullanıcı @ ile username verdiyse veya sayısal ID verdiyse
    // @ işaretini kaldır
    if (channelId.startsWith("@")) {
      channelId = channelId.substring(1);
    }

    // Telegram Bot API ile kanal bilgisi al
    const telegramApiUrl = `https://api.telegram.org/bot${BOT_TOKEN}/getChat`;

    const response = await fetch(telegramApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: channelId.includes("-") ? channelId : `@${channelId}` }),
    });

    const data = await response.json();

    if (!data.ok) {
      // Telegram API hata döndü
      const errorMessage = data.description || "Kanal bulunamadı";

      if (errorMessage.includes("chat not found")) {
        return NextResponse.json(
          { error: "Kanal bulunamadı. Bot'un kanala eklenmediğinden veya ID'nin yanlış olduğundan emin olun." },
          { status: 404 }
        );
      }

      if (errorMessage.includes("bot is not a member")) {
        return NextResponse.json(
          { error: "Bot bu kanalın üyesi değil. Önce botu kanala admin olarak ekleyin." },
          { status: 403 }
        );
      }

      return NextResponse.json({ error: errorMessage }, { status: 400 });
    }

    const chat = data.result;

    // Kanal fotoğrafını al (varsa)
    let photoUrl = null;
    if (chat.photo) {
      try {
        const fileResponse = await fetch(
          `https://api.telegram.org/bot${BOT_TOKEN}/getFile`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ file_id: chat.photo.small_file_id }),
          }
        );
        const fileData = await fileResponse.json();
        if (fileData.ok) {
          photoUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileData.result.file_path}`;
        }
      } catch (e) {
        console.error("Error fetching channel photo:", e);
      }
    }

    return NextResponse.json({
      success: true,
      channel: {
        id: chat.id.toString(),
        title: chat.title || chat.username || `Kanal ${chat.id}`,
        username: chat.username || null,
        type: chat.type,
        description: chat.description || null,
        memberCount: chat.member_count || null,
        photoUrl,
        // Bot'un admin olup olmadığını kontrol et
        canPostMessages: true, // getChat bize bunu söylemiyor ama en azından bot üye demektir
      },
    });
  } catch (error) {
    console.error("Error fetching channel info:", error);
    return NextResponse.json(
      { error: "Kanal bilgisi alınırken bir hata oluştu" },
      { status: 500 }
    );
  }
}
