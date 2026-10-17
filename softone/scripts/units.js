/*
 * SoftOne server-side script — ΜΟΝΑΔΙΚΗ εξαίρεση στον κανόνα «μόνο επίσημα S1 services».
 * Εγκρίθηκε ρητά από τον ιδιοκτήτη (17/10/2026) μόνο για την αλλαγή Μ.Μ.2 σε είδη με παραστατικά.
 *
 * Θέση στο SoftOne: φάκελος «skroutz», module «units» → διαδρομή κλήσης `skroutz.units` (ελέγχθηκε 17/10/2026).
 * Κλήση (POST):  https://<serial>.oncloud.gr/s1services/JS/<script>/setUnit2
 *   body: { "clientID": "...", "MTRL": 636, "MTRUNIT2": 202, "MU21": 52, "MU12MODE": 0, "DRYRUN": 1, "SECRET": "..." }
 *
 * Γιατί υπάρχει: το setData του ITEM απαντά «Δεν μπορεί να γίνει αλλαγή του πεδίου 'Μ.Μ.2'. Υπάρχουν
 * καταχωρημένα παραστατικά.» — ακόμη και για διαχειριστή μέσω Web Services (στο client είναι ερώτηση
 * επιβεβαίωσης). Το script γράφει ΜΟΝΟ τα MTRUNIT2 / MU21 / MU12MODE ενός είδους, με αυστηρούς ελέγχους.
 *
 * Τι ΔΕΝ κάνει: δεν αγγίζει βασική μονάδα, μονάδες αγορών/πώλησης, γραμμές παραστατικών ή αποθήκη.
 */

// ── Ρυθμίσεις ────────────────────────────────────────────────────────────────────────────────
// Κοινό μυστικό με την εφαρμογή (SOFTONE_UNITS_SECRET στο .env). ΑΛΛΑΞΤΕ ΤΟ πριν την ενεργοποίηση.
var SHARED_SECRET = 'ΑΛΛΑΞΤΕ-ΜΕ-ΤΟ-ΜΥΣΤΙΚΟ-ΑΠΟ-ΤΟ-.env';
// Μόνο αυτοί οι χρήστες SoftOne (USERS) μπορούν να το καλέσουν — 14 = «webapp» της εφαρμογής.
var ALLOWED_USERS = [14];
var MAX_RATIO = 100000;

// ── Βοηθητικά ────────────────────────────────────────────────────────────────────────────────
function fail(code, message) {
  return { success: false, code: code, error: message };
}

function toInt(v) {
  var n = parseInt(v, 10);
  return isNaN(n) ? null : n;
}

function toNum(v) {
  var n = parseFloat(String(v).replace(',', '.'));
  return isNaN(n) ? null : n;
}

function inList(list, v) {
  for (var i = 0; i < list.length; i++) if (list[i] == v) return true;
  return false;
}

/** Η τρέχουσα εικόνα των μονάδων του είδους (για πριν/μετά). */
function readItem(mtrl, company) {
  var ds = X.GETSQLDATASET(
    'SELECT MTRL, CODE, SODTYPE, MTRUNIT1, MTRUNIT2, MU21, MU12MODE FROM MTRL WHERE MTRL = :1 AND COMPANY = :2',
    mtrl, company
  );
  if (ds.RECORDCOUNT != 1) return null;
  ds.FIRST;
  return {
    MTRL: ds.MTRL,
    CODE: ds.CODE,
    SODTYPE: ds.SODTYPE,
    MTRUNIT1: ds.MTRUNIT1,
    MTRUNIT2: ds.MTRUNIT2,
    MU21: ds.MU21,
    MU12MODE: ds.MU12MODE
  };
}

// ── Web service ──────────────────────────────────────────────────────────────────────────────
function setUnit2(obj) {
  try {
    // 1. Ποιος καλεί
    if (!inList(ALLOWED_USERS, X.SYS.USER)) return fail('forbidden_user', 'Ο χρήστης ' + X.SYS.USER + ' δεν επιτρέπεται.');
    if (SHARED_SECRET.indexOf('ΑΛΛΑΞΤΕ') === 0) return fail('not_configured', 'Το script δεν έχει ρυθμιστεί (SHARED_SECRET).');
    if (obj.SECRET !== SHARED_SECRET) return fail('bad_secret', 'Λάθος μυστικό κλειδί.');

    // 2. Είσοδος
    var company = X.SYS.COMPANY;
    var mtrl = toInt(obj.MTRL);
    var unit2 = toInt(obj.MTRUNIT2);
    var ratio = toNum(obj.MU21);
    var mode = toInt(obj.MU12MODE);
    var dryRun = obj.DRYRUN == 1 || obj.DRYRUN === true;
    if (mtrl == null || mtrl <= 0) return fail('bad_mtrl', 'Άκυρο MTRL.');
    if (unit2 == null || unit2 <= 0) return fail('bad_unit', 'Άκυρη μονάδα Μ.Μ.2.');
    if (ratio == null || ratio <= 0 || ratio > MAX_RATIO) return fail('bad_ratio', 'Η σχέση Μ.Μ.2 πρέπει να είναι > 0 και ≤ ' + MAX_RATIO + '.');
    if (mode == null) mode = 0;
    if (mode !== 0 && mode !== 1) return fail('bad_mode', 'MU12MODE: 0 (ελεύθερη) ή 1 (αυστηρή).');

    // 3. Το είδος: υπάρχει, είναι ΕΙΔΟΣ (51) της τρέχουσας εταιρείας
    var before = readItem(mtrl, company);
    if (before == null) return fail('not_found', 'Το είδος ' + mtrl + ' δεν βρέθηκε στην εταιρεία ' + company + '.');
    if (before.SODTYPE != 51) return fail('not_item', 'Μόνο είδη αποθήκης (SODTYPE 51).');
    if (before.MTRUNIT1 == unit2) return fail('same_as_base', 'Η Μ.Μ.2 δεν μπορεί να είναι ίδια με τη βασική μονάδα.');

    // 4. Η μονάδα υπάρχει και είναι ενεργή
    var u = X.GETSQLDATASET('SELECT MTRUNIT FROM MTRUNIT WHERE MTRUNIT = :1 AND COMPANY = :2 AND ISACTIVE = 1', unit2, company);
    if (u.RECORDCOUNT != 1) return fail('unknown_unit', 'Η μονάδα ' + unit2 + ' δεν υπάρχει ή είναι ανενεργή.');

    // 5. Ασφάλεια ιστορικού: αν κάποια γραμμή έχει ΗΔΗ ποσότητα Μ.Μ.2, η αλλαγή θα την αλλοίωνε → άρνηση
    var used = X.SQL('SELECT COUNT(*) FROM MTRLINES WHERE MTRL = :1 AND ISNULL(QTY2, 0) <> 0', mtrl);
    if (toInt(used) > 0) {
      return fail('qty2_in_use', 'Υπάρχουν ' + used + ' γραμμές παραστατικών με ποσότητα Μ.Μ.2 — η αλλαγή θα αλλοίωνε το ιστορικό.');
    }

    var planned = { MTRUNIT2: unit2, MU21: ratio, MU12MODE: mode };
    if (dryRun) return { success: true, dryRun: true, before: before, planned: planned };

    // 6. Εγγραφή — ΜΟΝΟ τα τρία πεδία, ΜΟΝΟ αυτό το είδος
    X.RUNSQL(
      'UPDATE MTRL SET MTRUNIT2 = :1, MU21 = :2, MU12MODE = :3 WHERE MTRL = :4 AND COMPANY = :5',
      unit2, ratio, mode, mtrl, company
    );

    // 7. Επαλήθευση
    var after = readItem(mtrl, company);
    var ok = after != null && after.MTRUNIT2 == unit2 && Math.abs(parseFloat(after.MU21) - ratio) < 0.000001 && after.MU12MODE == mode;
    if (!ok) return { success: false, code: 'not_persisted', error: 'Η εγγραφή δεν επαληθεύτηκε.', before: before, after: after };
    return { success: true, dryRun: false, before: before, after: after };
  } catch (e) {
    return fail('exception', String(e));
  }
}
