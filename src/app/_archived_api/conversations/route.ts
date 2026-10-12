import { NextRequest, NextResponse } from "next/server";
import { fetchConversations, createConversation } from "@/lib/supabase/client";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId") || "emp_402";
    const conversations = await fetchConversations(userId);
    return NextResponse.json({ conversations });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const userId = body.userId || "emp_402";
    const title = body.title || "New Claim Session";
    const conversation = await createConversation(userId, title);
    return NextResponse.json({ conversation }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
