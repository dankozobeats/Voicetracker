import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const key = process.env.OPENAI_API_KEY;
    if (!key) {
      return NextResponse.json({ error: "OPENAI_API_KEY not set" }, { status: 500 });
    }

    const audio = await req.arrayBuffer();

    const form = new FormData();
    form.append("file", new Blob([audio]), "audio.webm");
    form.append("model", "whisper-1");
    form.append("response_format", "json");

    const result = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });

    const json = await result.json();
    return NextResponse.json(json);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
