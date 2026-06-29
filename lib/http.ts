import { NextResponse } from "next/server";

export const ok = (data: unknown, status = 200) =>
  NextResponse.json(data, { status });

export const err = (code: string, message: string, status = 400) =>
  NextResponse.json({ error: { code, message } }, { status });
