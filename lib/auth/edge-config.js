/**
 * Edge-safe auth configuration — shared between middleware and server.
 * Contains only JWT/session/callbacks/pages config. No providers, no DB imports.
 * Both instances use the same AUTH_SECRET for JWT signing/verification.
 *
 * Official pattern: https://authjs.dev/guides/edge-compatibility
 */
export const authConfig = {
  providers: [],
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  callbacks: {
    jwt({ token, user, trigger, session }) {
      if (user) {
        token.role = user.role;
        // mfaRequired: this user has MFA enabled and must complete a challenge.
        // mfaCompleted: false at sign-in for MFA users; true immediately when no MFA.
        token.mfaRequired = Boolean(user.mfaEnabled);
        token.mfaCompleted = !user.mfaEnabled;
      }
      // unstable_update({ mfaCompleted: true }) flows through here after a
      // successful MFA challenge. We only honor the mfaCompleted flag — every
      // other client-supplied field is ignored to keep the token tamper-safe.
      if (trigger === 'update' && session?.mfaCompleted === true) {
        token.mfaCompleted = true;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub;
        session.user.role = token.role;
        session.user.mfaRequired = Boolean(token.mfaRequired);
        session.user.mfaCompleted = Boolean(token.mfaCompleted);
      }
      return session;
    },
  },
};
