import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";

export const dynamic = "force-dynamic";

const REDIS_KEY = "vion:site_views";

export async function GET() {
  try {
    if (!redis) {
      return NextResponse.json({ views: 0, status: "redis_not_configured" });
    }
    const result = await redis.get<number | string>(REDIS_KEY);
    const views =
      typeof result === "number"
        ? result
        : result
        ? parseInt(String(result), 10)
        : 0;
    return NextResponse.json({ views: isNaN(views) ? 0 : views });
  } catch (error) {
    console.error("Failed to get site views:", error);
    return NextResponse.json({ views: 0, error: "redis_error" }, { status: 500 });
  }
}

export async function POST() {
  try {
    if (!redis) {
      return NextResponse.json({ views: 0, status: "redis_not_configured" });
    }
    const result = await redis.incr(REDIS_KEY);
    const views =
      typeof result === "number" ? result : parseInt(String(result), 10) || 0;
    return NextResponse.json({ views });
  } catch (error) {
    console.error("Failed to increment site views:", error);
    return NextResponse.json({ views: 0, error: "redis_error" }, { status: 500 });
  }
}
