/**
 * Which term(s) a bus / students report is about.
 * Reports used to take every bus of the branch across ALL terms, so after a term change they mixed the old
 * and the new fleet (and counted students twice). Default: the current term of the branch type; an explicit
 * `termId` in the request wins.
 */
import { getCurrentTermWithState } from '../services/termLifecycleService.js';

export async function currentTermIdForType(branchType) {
  const { term } = await getCurrentTermWithState(branchType);
  return term?.id || null;
}

/** [termId] when given, otherwise the current term id of every branch type that has one. */
export async function reportTermIds(explicitTermId, branchTypes = ['school', 'healthcare_center']) {
  const explicit = parseInt(explicitTermId, 10);
  if (Number.isInteger(explicit)) return [explicit];
  const ids = [];
  for (const type of new Set(branchTypes)) {
    const id = await currentTermIdForType(type);
    if (id) ids.push(id);
  }
  return ids;
}
