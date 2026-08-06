/** The scoring roster — who fired a relay. Not a login account.
 *  Note `badgeNumber` is camelCase now; the old backend sent `badge_number`. */
export interface Shooter {
  id: string;
  name: string;
  rank: string | null;
  badgeNumber: string | null;
  /** Optional so the UI can synthesise a placeholder roster entry from a bare
   *  session's shooterName, for sessions recorded before a roster existed. */
  createdAt?: string;
}
