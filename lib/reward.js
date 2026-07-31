// Shared reward rule + shared dropdown lists.
// Both app/new-log/page.js and app/log/[id]/page.js import from here,
// so the rule and the option lists only ever need to be changed in ONE place.

export const REWARD_THRESHOLD = 15000;
export const REWARD_AMOUNT = 50;

// Amendment 4: departments that count as the driver/logistics team's OWN fault.
// If a log has ANY error from one of these departments — even after it's marked
// resolved — that log permanently loses the RM50 bonus.
// Sales/Customer/Other errors do NOT disqualify the bonus once resolved.
const DISQUALIFYING_DEPARTMENTS = ['Operation', 'Logistics'];

/**
 * Works out whether a dispatch log currently qualifies for the RM50 bonus.
 * @param {number} toDeliveryTotal - sum of all To Delivery invoice amounts
 * @param {{ department: string, resolved: boolean }[]} errors - this log's status_errors rows
 */
export function computeRewardEarned(toDeliveryTotal, errors) {
  if (toDeliveryTotal <= REWARD_THRESHOLD) return false;

  const hasUnresolvedError = errors.some((e) => !e.resolved);
  if (hasUnresolvedError) return false;

  const hasOwnFaultError = errors.some((e) => DISQUALIFYING_DEPARTMENTS.includes(e.department));
  if (hasOwnFaultError) return false;

  return true;
}

// Amendment 3: updated error type list
export const ERROR_TYPES = [
  'Wrong Item Delivered',
  'Missing Item',
  'Fail to Fully Deliver',
  'Damaged Goods',
  'Wrong Item/Amount Billed',
  'Wrong Address Billed',
  'Fail to Load',
  'Other',
];

// Amendment 2: updated department list (Warehouse & Finance removed, Dispatch -> Logistics, Operation added)
export const DEPARTMENTS = ['Sales', 'Customer', 'Logistics', 'Operation', 'Other'];
