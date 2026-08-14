import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { getManagersCollection } from "@/lib/mongodb";

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
    }),
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
          adminEmail &&
          credentials.email.trim().toLowerCase() === adminEmail.trim().toLowerCase() &&
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
          const email = credentials.email.trim().toLowerCase();
          const manager = await managers.findOne({ email });
          if (!manager) {
            console.error(`[auth] no manager found for email: ${email}`);
            return null;
          }

          const valid = await bcrypt.compare(credentials.password, manager.passwordHash);
          if (!valid) {
            console.error(`[auth] wrong password for manager: ${email}`);
            return null;
          }

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
    error: "/login",
  },
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "google") {
        const email = user.email?.toLowerCase();
        const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase();
        if (email === adminEmail) return true;

        // Also allow managers whose email is already registered in MongoDB.
        try {
          const managers = await getManagersCollection();
          const manager = await managers.findOne({ email });
          return !!manager;
        } catch (err) {
          console.error("[auth] google manager lookup failed:", String(err));
          return false;
        }
      }
      return true;
    },
    async jwt({ token, user, account }) {
      if (user) {
        if (account?.provider === "google") {
          const email = user.email?.toLowerCase();
          const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase();
          if (email === adminEmail) {
            token.role = "admin";
            token.team = undefined;
          } else {
            try {
              const managers = await getManagersCollection();
              const manager = await managers.findOne({ email });
              token.role = "manager";
              token.team = manager?.team;
              if (manager?.name) token.name = manager.name;
            } catch (err) {
              console.error("[auth] google manager lookup failed:", String(err));
            }
          }
        } else {
          token.role = user.role;
          token.team = user.team;
        }
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
