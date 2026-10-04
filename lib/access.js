// Login and access rules shared by every page.

// People log in with their PHONE NUMBER. Behind the scenes it becomes a hidden login ID.
// ".invalid" is a reserved ending that can never be a real email, so nothing is ever emailed.
// LHG Journey uses exactly the same rule, so one account works in both apps.
export const LOGIN_DOMAIN = 'phone.lhg.invalid';

// "012-345 6789", "+60 12 345 6789", "0123456789" -> "60123456789@phone.lhg.invalid"
export function phoneToLoginId(input) {
  let d = String(input || '').replace(/\D/g, '');
  if (d.startsWith('0')) d = '6' + d;      // 012... -> 6012...
  if (!d.startsWith('60')) d = '60' + d;   // 12...  -> 6012...
  return `${d}@${LOGIN_DOMAIN}`;
}

// Admin flag now lives in app_metadata (users can't edit it themselves).
export const isAdminUser = (user) => user?.app_metadata?.role === 'admin';

// Who may open LHG Wheels: admin, or anyone LHG Journey has given the "wheels" app
// (Admin, HR, Operation and Logistics, once Journey is live).
export const canUseWheels = (user) =>
  isAdminUser(user) || (Array.isArray(user?.app_metadata?.apps) && user.app_metadata.apps.includes('wheels'));
