/** Product-language messages shared across the app (never mention infrastructure providers). */

/** Shown instead of any internal server / database / gateway error text. */
export const TEMPORARILY_UNAVAILABLE = "BEAST FEAST is temporarily unavailable. Please try again in a moment.";

/** The club's sign-up / reset email allowance is shared by everyone. */
export const EMAIL_LIMIT_REACHED = "We can't send more emails right now — the club's hourly email limit has been reached. Please try again later, or ask a club admin for help.";

/** Sign-ins are limited per network address; a whole classroom on one Wi-Fi shares that allowance. */
export const SIGNIN_NETWORK_LIMIT = "Lots of people on this network are signing in at once. Please wait a minute and try again — you only need to sign in once per device.";

/** Shown when an email was already sent recently from this device (prevents duplicate sign-up / reset emails). */
export const emailRecentlySent = (seconds: number) => `We already sent you an email ${seconds < 60 ? "a moment" : `${Math.round(seconds / 60)} minute${seconds >= 120 ? "s" : ""}`} ago. Check your inbox and spam folder before asking for another.`;
