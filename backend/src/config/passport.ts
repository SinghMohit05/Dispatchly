import passport from "passport";
import { Strategy as GoogleStrategy, Profile } from "passport-google-oauth20";
import { env } from "./env.js";
import { prisma } from "../db/index.js";

// Serialize user into session
passport.serializeUser((user: any, done) => {
  done(null, user);
});

// Deserialize user from session
passport.deserializeUser(async (user: any, done) => {
  if (user && typeof user === "object" && user.id) {
    return done(null, user);
  }
  try {
    const dbUser = await prisma.user.findUnique({
      where: { id: String(user) },
    });
    done(null, dbUser || { id: user });
  } catch (err) {
    console.warn("⚠️ [Passport] Database offline during deserializeUser. Falling back to session user.");
    done(null, typeof user === "string" ? { id: user } : user);
  }
});

export const isGoogleOAuthConfigured = Boolean(
  env.GOOGLE_CLIENT_ID &&
  env.GOOGLE_CLIENT_SECRET &&
  env.GOOGLE_CALLBACK_URL
);

if (isGoogleOAuthConfigured) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: env.GOOGLE_CLIENT_ID!,
        clientSecret: env.GOOGLE_CLIENT_SECRET!,
        callbackURL: env.GOOGLE_CALLBACK_URL!,
        passReqToCallback: true,
      },
      async (
        _req: any,
        accessToken: string,
        refreshToken: string,
        profile: Profile,
        done: (err: any, user?: any) => void
      ) => {
        try {
          const email = profile.emails?.[0]?.value;
          if (!email) {
            return done(new Error("No email returned from Google account profile."));
          }

          const name =
            profile.displayName ||
            [profile.name?.givenName, profile.name?.familyName]
              .filter(Boolean)
              .join(" ") ||
            email;

          const avatarUrl = profile.photos?.[0]?.value || null;

          let user: any;
          try {
            // Upsert Google User into Postgres when database is reachable
            user = await prisma.user.upsert({
              where: { googleId: profile.id },
              update: {
                name,
                email,
                avatarUrl,
              },
              create: {
                googleId: profile.id,
                name,
                email,
                avatarUrl,
              },
            });
          } catch (dbError: any) {
            console.warn(
              "⚠️ [Passport] Database offline during Google Auth upsert. Falling back to session user:",
              dbError?.message || dbError
            );
            user = {
              id: `google_${profile.id}`,
              googleId: profile.id,
              name,
              email,
              avatarUrl,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
          }

          // Attach live OAuth tokens for email dispatch
          user.accessToken = accessToken;
          user.refreshToken = refreshToken;

          return done(null, user);
        } catch (error) {
          return done(error as Error);
        }
      }
    )
  );
  console.log("🔐 [Passport] Google OAuth Strategy registered successfully.");
} else {
  console.warn(
    "⚠️ [Passport] Google OAuth credentials not fully configured in .env (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALLBACK_URL)."
  );
}

export default passport;
