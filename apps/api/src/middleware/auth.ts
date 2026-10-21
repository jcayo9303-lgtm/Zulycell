import type { RequestHandler, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { prisma } from "../lib/prisma.js";
import { forbidden, unauthorized } from "../lib/errors.js";
import { ALL_PERMISSIONS, normalizePermissions, type Permission, type PermissionMap } from "../lib/permissions.js";

export const SESSION_COOKIE = "zc_session";
export const SIGNUP_COOKIE = "zc_signup";

export type SessionClaims = { sub: string; bid: string };
export type SignupClaims = { kind: "signup"; email: string; authId: string };

export type AuthContext = {
  userId: string;
  businessId: string;
  role: "OWNER" | "EMPLOYEE";
  permissions: PermissionMap;
  currency: string;
  plan: "FREE" | "PRO";
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

const cookieBase = () => ({
  httpOnly: true,
  secure: config.cookieSecure,
  sameSite: "lax" as const,
  path: "/",
});

export function setSessionCookie(res: Response, claims: SessionClaims) {
  const token = jwt.sign(claims, config.jwtSecret, { expiresIn: `${config.sessionDays}d` });
  res.cookie(SESSION_COOKIE, token, { ...cookieBase(), maxAge: config.sessionDays * 86_400_000 });
}

export function setSignupCookie(res: Response, claims: SignupClaims) {
  const token = jwt.sign(claims, config.jwtSecret, { expiresIn: "30m" });
  res.cookie(SIGNUP_COOKIE, token, { ...cookieBase(), maxAge: 30 * 60_000 });
}

export function clearAuthCookies(res: Response) {
  res.clearCookie(SESSION_COOKIE, cookieBase());
  res.clearCookie(SIGNUP_COOKIE, cookieBase());
}

export function readSignupClaims(token: string | undefined): SignupClaims | null {
  if (!token) return null;
  try {
    const claims = jwt.verify(token, config.jwtSecret) as SignupClaims;
    return claims.kind === "signup" ? claims : null;
  } catch {
    return null;
  }
}

/** Exige sesión válida y una membresía activa en el negocio de la sesión. */
export const requireAuth: RequestHandler = async (req, _res, next) => {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) throw unauthorized();
  let claims: SessionClaims;
  try {
    claims = jwt.verify(token, config.jwtSecret) as SessionClaims;
  } catch {
    throw unauthorized();
  }
  const membership = await prisma.membership.findUnique({
    where: { userId_businessId: { userId: claims.sub, businessId: claims.bid } },
    include: { business: { select: { currency: true, plan: true } } },
  });
  if (!membership || !membership.active) throw unauthorized();
  req.auth = {
    userId: claims.sub,
    businessId: claims.bid,
    role: membership.role,
    permissions: membership.role === "OWNER" ? ALL_PERMISSIONS : normalizePermissions(membership.permissions),
    currency: membership.business.currency,
    plan: membership.business.plan,
  };
  next();
};

/** Exige al menos uno de los permisos indicados. */
export const requirePerm =
  (...perms: Permission[]): RequestHandler =>
  (req, _res, next) => {
    const auth = req.auth;
    if (!auth) throw unauthorized();
    if (auth.role === "OWNER" || perms.some((p) => auth.permissions[p])) return next();
    throw forbidden();
  };

export const requireOwner: RequestHandler = (req, _res, next) => {
  if (req.auth?.role !== "OWNER") throw forbidden("Solo el propietario del negocio puede hacer esto.");
  next();
};

/** Acceso a la sesión ya validada dentro de un handler. */
export function ctx(req: Express.Request): AuthContext {
  if (!req.auth) throw unauthorized();
  return req.auth;
}
