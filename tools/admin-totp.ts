/**
 * The back office's TOTP secret (admin/totp.ts).
 *
 *   bun tools/admin-totp.ts            a new secret + the link for the app
 *   bun tools/admin-totp.ts <secret>   the code it shows right now (a check)
 *
 * The OWNER's secret (ADMIN_OWNER_EMAIL), in the site's ADMIN_TOTP_SECRET on
 * Coolify (rr-admin, admin.rabbit.rip). Never in the repo. The team's members
 * get theirs from a setup link (admin/team.ts), not from here.
 */
import { randomBytes } from 'node:crypto';
import { base32Decode, base32Encode, totpAt } from '../admin/totp';

const given = process.argv[2];
if (given) {
  const step = Math.floor(Date.now() / 1000 / 30);
  console.log(`code now: ${totpAt(base32Decode(given), step)}`);
} else {
  const secret = base32Encode(randomBytes(20));
  const uri = `otpauth://totp/Rabbit%20Royale:back-office?secret=${secret}&issuer=Rabbit%20Royale&digits=6&period=30`;
  console.log(`ADMIN_TOTP_SECRET=${secret}\n\nAuthenticator app link (or type the secret by hand):\n${uri}`);
}
