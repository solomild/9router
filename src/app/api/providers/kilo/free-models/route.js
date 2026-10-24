import { NextResponse } from "next/server";
import { resolveKiloCatalog } from "open-sse/services/kiloModels.js";

// The catalog itself lives in open-sse/services/kiloModels.js — shared with
// /api/providers/[id]/models so the picker and this list can never disagree
// about which Kilo models exist. This route only narrows it to the free tier and
// keeps the field names the provider page reads.
export async function GET() {
  const { models, cached, warning } = await resolveKiloCatalog({ log: console });

  if (models.length === 0) {
    return NextResponse.json(
      { models: [], error: `Failed to fetch Kilo models: ${warning || "empty catalog"}` },
      { status: 502 }
    );
  }

  return NextResponse.json({
    models: models
      .filter((m) => m.isFree)
      .map((m) => ({ id: m.id, name: m.name, isFree: true, context_length: m.contextLength || 0 })),
    cached,
    ...(warning ? { warning } : {}),
  });
}
