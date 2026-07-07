import { NextResponse } from "next/server";
import { getSessionUser, SessionUser } from "./session";

export async function requireAdmin(req: Request): Promise<SessionUser | NextResponse> {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  if (!user.isAdmin) {
    return NextResponse.json({ error: "无权访问" }, { status: 403 });
  }
  return user;
}
