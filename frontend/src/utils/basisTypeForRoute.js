// Document type that goes with a dossier route. A type the staff member already picked is kept
// when it is valid for the route, so reloading the dossier never changes it behind their back.
const allowedByRoute = {
  NOTARIAL: ['NOTARIAL_PARTITION'],
  COURT: ['COURT_JUDGMENT', 'COURT_DECISION'],
};

export function basisTypeForRoute(current, route) {
  const allowed = allowedByRoute[route];
  if (!allowed) return current;
  return allowed.includes(current) ? current : allowed[0];
}
