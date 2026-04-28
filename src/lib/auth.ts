import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { db } from "@/lib/db";

// Build providers list - OIDC is optional
const providers: NextAuthOptions["providers"] = [
  CredentialsProvider({
    name: "Demo Login",
    credentials: {
      email: { label: "Email", type: "email", placeholder: "demo@taskflow.app" },
    },
    async authorize(credentials) {
      if (!credentials?.email) return null;

      // Auto-create user if not exists
      let user = await db.user.findUnique({ where: { email: credentials.email } });
      if (!user) {
        user = await db.user.create({
          data: {
            email: credentials.email,
            name: credentials.email.split("@")[0],
          },
        });
      }

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
      };
    },
  }),
];

// Conditionally add OIDC provider if env vars are configured
// Uses a custom OAuth provider configuration for generic OIDC
const oidcIssuer = process.env.OIDC_ISSUER?.replace(/\/+$/, '');
const oidcClientId = process.env.OIDC_CLIENT_ID;
const oidcClientSecret = process.env.OIDC_CLIENT_SECRET;

if (oidcIssuer && oidcClientId && oidcClientSecret) {
  const nextauthUrl = process.env.NEXTAUTH_URL || "";
  providers.push({
    id: "oidc",
    name: "OIDC Provider",
    type: "oauth",
    issuer: oidcIssuer,
    clientId: oidcClientId,
    clientSecret: oidcClientSecret,
    wellKnown: `${oidcIssuer}/.well-known/openid-configuration`,
    authorization: {
      params: {
        scope: "openid email profile",
        redirect_uri: `${nextauthUrl}/api/auth/callback/oidc`,
      },
    },
    idToken: true,
    checks: ["pkce", "state"],
    profile(profile) {
      return {
        id: profile.sub,
        name: profile.name ?? profile.email?.split("@")[0],
        email: profile.email,
        image: profile.picture,
      };
    },
  });
}

export const authOptions: NextAuthOptions = {
  providers,
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user, account }) {
      // First time login - store user id
      if (user) {
        token.id = user.id;
        token.email = user.email;
      }
      // OIDC login - auto-create user in DB
      if (account?.provider === "oidc" && user?.email) {
        let dbUser = await db.user.findUnique({ where: { email: user.email } });
        if (!dbUser) {
          dbUser = await db.user.create({
            data: {
              email: user.email,
              name: user.name ?? user.email.split("@")[0],
              image: user.image,
              oidcId: account.providerAccountId,
              oidcProvider: account.provider,
            },
          });
        } else if (!dbUser.oidcId) {
          // Link OIDC account to existing user
          await db.user.update({
            where: { id: dbUser.id },
            data: {
              oidcId: account.providerAccountId,
              oidcProvider: account.provider,
            },
          });
        }
        token.id = dbUser.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET ?? "taskflow-dev-secret-change-in-production",
};
