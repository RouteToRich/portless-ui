/**
 * The auth-service app account this console signs people in under.
 *
 * Sent as `account_id` on sign-in and sign-up, exactly as MakeMeRich does with
 * REACT_APP_MAKEMERICH_ACCOUNT_ID: auth-service resolves the user's record IN
 * this application and answers a non-member with the same 401 as a wrong
 * password, and the PortLess backend refuses a token scoped to any other
 * application (PORTLESS_ACCOUNT_ID there — the same value).
 *
 * A UUID minted by the account-management console — an identifier, not a
 * secret. Vite inlines VITE_* at BUILD time, so set it in the deployment's
 * environment (Vercel project settings) or .env, then rebuild.
 *
 * Unlike MakeMeRich this does not throw at boot when unset: the console is
 * deployed before its app account exists, so the sign-in page explains what is
 * missing and refuses to submit instead of showing a blank screen. Sending a
 * login WITHOUT account_id is never an option — auth-service would then skip
 * the membership check and let any application's credentials through.
 */
export const PORTLESS_ACCOUNT_ID: string = (import.meta.env.VITE_PORTLESS_ACCOUNT_ID ?? "").trim();

export const isAccountConfigured = PORTLESS_ACCOUNT_ID.length > 0;
