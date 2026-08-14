import type { DefaultSession, DefaultUser } from "next-auth";
import type { DefaultJWT } from "next-auth/jwt";

export type UserRole = "admin" | "manager";

declare module "next-auth" {
  interface User extends DefaultUser {
    role: UserRole;
    team?: string;
  }

  interface Session {
    user: DefaultSession["user"] & {
      role: UserRole;
      team?: string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    role?: UserRole;
    team?: string;
  }
}
