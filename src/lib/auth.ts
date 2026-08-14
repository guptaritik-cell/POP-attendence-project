import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { getManagersCollection } from "@/lib/mongodb";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const adminEmail = process.env.ADMIN_EMAIL;
        const adminPassword = process.env.ADMIN_PASSWORD;

        if (
          credentials.email === adminEmail &&
          credentials.password === adminPassword
        ) {
          return {
            id: "1",
            name: "Admin",
            email: adminEmail,
            role: "admin",
          };
        }

        // Fallback: manager accounts stored in MongoDB. Any DB error must
        // never block the admin path above — just fail this login attempt.
        try {
          const managers = await getManagersCollection();
          const manager = await managers.findOne({ email: credentials.email });
          if (!manager) return null;

          const valid = await bcrypt.compare(credentials.password, manager.passwordHash);
          if (!valid) return null;

          return {
            id: manager._id?.toString() ?? manager.email,
            name: manager.name,
            email: manager.email,
            role: "manager",
            team: manager.team,
          };
        } catch (err) {
          console.error("[auth] manager lookup failed:", String(err));
          return null;
        }
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.team = user.team;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.role = token.role ?? "admin";
        session.user.team = token.team;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
