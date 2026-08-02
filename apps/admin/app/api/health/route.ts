import { NextResponse } from "next/server";

import { adminReady } from "../../../server/identity";

export async function GET() { return NextResponse.json({ status: "ok" }, { status: await adminReady() ? 200 : 503 }); }
