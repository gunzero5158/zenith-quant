import { NextResponse } from "next/server";
import { getSessionUser, isAdminEmail, SessionUser } from "./session";

// ADMIN_EMAILS is the single authority, checked per request — removing an
// email from the env revokes admin access immediately, with no stale DB flag
// or 7-day session window to wait out.
export async function requireAdmin(req: import("next/server").NextRequest): Promise<SessionUser | NextResponse> {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  if (!isAdminEmail(user.email)) {
    return NextResponse.json({ error: "无权访问" }, { status: 403 });
  }
  return user;
}
