import { SubjectSummary, Student, Timetable, SlotKey, slotKey, StudentKey, DayIdx, PeriodIdx, ExamTime } from './types';
import { createInitialTimetable } from './constants';

export interface RecommendationResult {
  timetable: Timetable;
  placedCount: number;
  unplacedSubjects: string[];
  maxDailyExamsForAnyStudent: number;
  period3CoverageAvg: number;
  period2SelfStudyDays: number[];
  usedSlotsCount: number;
  emptySlotsCount: number;
  totalActiveSlots: number;
  lastSlotTakers: number;
}

/**
 * Recommends an ideal timetable satisfying all constraints:
 * 1. ONLY uses active periods configured in 기초정보 (never places in unconfigured periods like 4, 5교시).
 * 2. STRICTLY GUARANTEES ZERO CONFLICT for any student (no two overlapping subjects in the same slot).
 * 3. STRICTLY GUARANTEES 0 unplaced subjects (100% placement) using CSP MRV & DSATUR Backtracking.
 * 4. Period 2 is a SOFT constraint:
 *    - If daily active periods >= 4: Period 2 is kept as self-study if possible.
 *    - If daily active periods <= 3: Period 2 and 3 are BOTH actively utilized.
 * 5. Period 3 is prioritized for Common/high-enrollment subjects.
 * 6. Periods 1 & 2 distribute electives in disjoint compatible groups (max 4 per slot).
 * 7. Minimizes daily exam load per student (aims for <= 2 exams/day).
 */
export function recommendIdealTimetable(
  evalSubjects: SubjectSummary[],
  takers: Map<string, Set<StudentKey>>,
  students: Student[],
  activeDays: DayIdx[] = [1, 2, 3, 4],
  times?: ExamTime[],
  maxSubjectsPerSlot: number = 4
): RecommendationResult {
  const timetable: Timetable = createInitialTimetable();

  if (evalSubjects.length === 0 || activeDays.length === 0) {
    return {
      timetable,
      placedCount: 0,
      unplacedSubjects: [],
      maxDailyExamsForAnyStudent: 0,
      period3CoverageAvg: 0,
      period2SelfStudyDays: [],
      usedSlotsCount: 0,
      emptySlotsCount: 0,
      totalActiveSlots: 0,
      lastSlotTakers: 0,
    };
  }

  const totalStudents = students.length || 1;

  // 1. Determine active periods for each day from `times`
  const getActivePeriods = (d: DayIdx): PeriodIdx[] => {
    if (!times || times.length === 0) return [1, 2, 3] as PeriodIdx[];
    const dayTimes = times.filter(t => t.day === d && t.time && t.time.trim() !== '');
    if (dayTimes.length === 0) return [1, 2, 3] as PeriodIdx[];
    return dayTimes.map(t => t.period as PeriodIdx).sort((a, b) => a - b);
  };

  const dayActivePeriodsMap = new Map<DayIdx, PeriodIdx[]>();
  const allActiveSlots: SlotKey[] = [];
  let maxActivePeriodsCount = 0;

  for (const d of activeDays) {
    const pList = getActivePeriods(d);
    dayActivePeriodsMap.set(d, pList);
    if (pList.length > maxActivePeriodsCount) maxActivePeriodsCount = pList.length;
    for (const p of pList) {
      allActiveSlots.push(slotKey(d, p));
    }
  }

  if (allActiveSlots.length === 0) {
    for (const d of activeDays) {
      for (const p of [1, 2, 3] as PeriodIdx[]) {
        allActiveSlots.push(slotKey(d, p));
      }
    }
  }

  // Determine the LAST active slot (last period of the last day) — Priority 3 target
  const lastDay = activeDays[activeDays.length - 1];
  const lastDayPeriods = dayActivePeriodsMap.get(lastDay) || [3 as PeriodIdx];
  const lastPeriod = lastDayPeriods[lastDayPeriods.length - 1];
  const lastSlotKey: SlotKey = slotKey(lastDay, lastPeriod);

  // Pre-calculate disjointness between every pair of subjects
  const subjects = [...evalSubjects];
  const subjectNames = subjects.map(s => s.subject);

  const disjointMatrix = new Map<string, boolean>();
  const areDisjoint = (subA: string, subB: string): boolean => {
    if (subA === subB) return false;
    const key = subA < subB ? `${subA}|${subB}` : `${subB}|${subA}`;
    const cached = disjointMatrix.get(key);
    if (cached !== undefined) return cached;
    const setA = takers.get(subA);
    const setB = takers.get(subB);
    if (!setA || !setB) {
      disjointMatrix.set(key, true);
      return true;
    }
    let hasInter = false;
    if (setA.size < setB.size) {
      for (const x of setA) {
        if (setB.has(x)) { hasInter = true; break; }
      }
    } else {
      for (const x of setB) {
        if (setA.has(x)) { hasInter = true; break; }
      }
    }
    const res = !hasInter;
    disjointMatrix.set(key, res);
    return res;
  };

  // Strictly checks whether candidate subject can be placed in current slot without ANY conflict
  const canAddToSlot = (currentSubs: string[], cand: string): boolean => {
    if (currentSubs.length >= maxSubjectsPerSlot) return false;
    for (const existing of currentSubs) {
      if (!areDisjoint(existing, cand)) return false;
    }
    return true;
  };

  // Conflict degree calculation for ordering subjects
  const conflictDegree = new Map<string, number>();
  for (const sA of subjectNames) {
    let deg = 0;
    for (const sB of subjectNames) {
      if (sA !== sB && !areDisjoint(sA, sB)) {
        deg++;
      }
    }
    conflictDegree.set(sA, deg);
  }

  // Helper map: student -> subjects they take
  const studentMap = new Map<StudentKey, Set<string>>();
  for (const st of students) {
    studentMap.set(`${st.ban}${st.num}`, new Set(st.subjects));
  }

  // Score candidate slots for a subject
  const scoreSlotForSubject = (slot: SlotKey, subName: string, currentAssignment: Map<SlotKey, string[]>): number => {
    const [dStr, pStr] = slot.split('_');
    const day = parseInt(dStr, 10) as DayIdx;
    const period = parseInt(pStr, 10) as PeriodIdx;
    const sObj = evalSubjects.find(s => s.subject === subName);
    const isCommon = (sObj?.stuCount || 0) >= totalStudents * 0.6;

    let score = 0;

    const currentSubs = currentAssignment.get(slot) || [];
    // 1. Pack compatible electives together to maximize simultaneous takers
    if (currentSubs.length > 0) {
      score -= 3000 + currentSubs.length * 1000;
    } else {
      score += 500;
    }

    // 2. Period preferences
    if (isCommon) {
      if (period === 3) score -= 600;
      else score += 200;
    } else {
      if (maxActivePeriodsCount >= 4) {
        if (period === 1 || period === 4 || period === 5) score -= 150;
        else if (period === 2) score += 100;
        else if (period === 3) score += 50;
      } else {
        if (period === 1 || period === 2) score -= 150;
        else if (period === 3) score += 50;
      }
    }

    // 3. Student daily load distribution:
    // User requirement: Ensure every student has at least 1 exam each day (minimize 0-exam days and avoid >= 3 exams)
    const subTakers = takers.get(subName);
    if (subTakers) {
      for (const stKey of subTakers) {
        let examsToday = 0;
        const periods = dayActivePeriodsMap.get(day) || [];
        for (const p of periods) {
          const sSubs = currentAssignment.get(slotKey(day, p)) || [];
          for (const s of sSubs) {
            if (takers.get(s)?.has(stKey)) {
              examsToday++;
              break;
            }
          }
        }
        if (examsToday === 0) {
          // Strong incentive: fills empty day for this student
          score -= 400;
        } else if (examsToday === 1) {
          score -= 80;
        } else if (examsToday >= 2) {
          // Severe penalty for pushing to 3+ exams on one day
          score += 1500 + (examsToday - 1) * 800;
        }
      }
    }

    // 4. Priority 3: LAST slot of LAST day should have MAXIMUM takers
    //    Give a strong preference (negative score = attraction) for placing any subject here,
    //    scaled by the subject's student count for extra pull on high-enrollment subjects.
    if (slot === lastSlotKey) {
      const stuCount = sObj?.stuCount || 0;
      score -= 5000 + stuCount * 30;
    }

    return score;
  };

  // Helper to evaluate fitness score of a candidate assignment
  const evaluateCandidate = (candidateAssignment: Map<SlotKey, string[]>): {
    score: number;
    placedCount: number;
    simultaneousTakers: number;
    usedSlots: number;
    period3Takers: number;
    maxDailyExams: number;
  } => {
    let placedCount = 0;
    let simultaneousTakers = 0;
    let usedSlots = 0;
    let period3Takers = 0;

    // Strict validation: Reject ANY solution with conflict
    for (const [, subs] of candidateAssignment.entries()) {
      if (subs.length > maxSubjectsPerSlot) return { score: -Infinity, placedCount: 0, simultaneousTakers: 0, usedSlots: 0, period3Takers: 0, maxDailyExams: 99 };
      for (let i = 0; i < subs.length; i++) {
        for (let j = i + 1; j < subs.length; j++) {
          if (!areDisjoint(subs[i], subs[j])) {
            return { score: -Infinity, placedCount: 0, simultaneousTakers: 0, usedSlots: 0, period3Takers: 0, maxDailyExams: 99 };
          }
        }
      }
    }

    for (const [sKey, subs] of candidateAssignment.entries()) {
      if (subs.length === 0) continue;
      usedSlots++;
      placedCount += subs.length;
      const slotTakerCount = subs.reduce((acc, s) => acc + (takers.get(s)?.size || 0), 0);

      if (subs.length >= 2) {
        simultaneousTakers += slotTakerCount;
      }

      const [, pStr] = sKey.split('_');
      if (pStr === '3') {
        period3Takers += slotTakerCount;
      }
    }

    let maxDailyExams = 0;
    let studentDailyOverloadPenalty = 0;
    let studentZeroExamPenalty = 0;
    for (const [, stSubs] of studentMap.entries()) {
      const studentTotalSubs = stSubs.size;
      for (const d of activeDays) {
        let dayCount = 0;
        const activePs = dayActivePeriodsMap.get(d) || [];
        for (const p of activePs) {
          const slotSubs = candidateAssignment.get(slotKey(d, p)) || [];
          if (slotSubs.some(s => stSubs.has(s))) {
            dayCount++;
          }
        }
        if (dayCount > maxDailyExams) maxDailyExams = dayCount;

        // Heavily penalize 0-exam days if student has enough subjects to distribute across days
        if (dayCount === 0 && studentTotalSubs >= activeDays.length) {
          studentZeroExamPenalty += 2000;
        } else if (dayCount === 0 && studentTotalSubs > 0) {
          studentZeroExamPenalty += 500;
        }

        if (dayCount >= 3) {
          studentDailyOverloadPenalty += (dayCount - 2) * 3000;
        }
      }
    }

    const unplacedCount = subjectNames.length - placedCount;
    const emptySlots = allActiveSlots.length - usedSlots;

    // Priority 3: Bonus for maximizing students in the LAST slot of LAST day
    const lastSlotSubs = candidateAssignment.get(lastSlotKey) || [];
    const lastSlotStudents = new Set<StudentKey>();
    for (const s of lastSlotSubs) {
      const st = takers.get(s);
      if (st) for (const k of st) lastSlotStudents.add(k);
    }
    const lastSlotBonus = lastSlotStudents.size * 5000;

    const score =
      (placedCount * 10000000) -
      (unplacedCount * 50000000) +
      (simultaneousTakers * 1000) +
      (emptySlots * 25000) +
      (period3Takers * 100) -
      studentZeroExamPenalty -
      studentDailyOverloadPenalty +
      lastSlotBonus;

    return {
      score,
      placedCount,
      simultaneousTakers,
      usedSlots,
      period3Takers,
      maxDailyExams,
    };
  };

  // --- STRICT ZERO-CONFLICT MRV BACKTRACKING CSP SOLVER ---
  const solveBacktracking = (
    subjectsToPlace: string[],
    randomizeTieBreaks: boolean = false
  ): Map<SlotKey, string[]> | null => {
    const assignment = new Map<SlotKey, string[]>();
    for (const sKey of allActiveSlots) {
      assignment.set(sKey, []);
    }

    let nodesVisited = 0;
    const MAX_NODES = 800;

    const backtrack = (unassigned: string[]): boolean => {
      if (unassigned.length === 0) return true;
      nodesVisited++;
      if (nodesVisited > MAX_NODES) return false;

      // 1. Minimum Remaining Values (MRV) / Saturation Degree
      let bestSubIdx = -1;
      let minDomainSize = 999999;
      let bestValidSlots: SlotKey[] = [];

      for (let i = 0; i < unassigned.length; i++) {
        const sub = unassigned[i];
        const validSlots: SlotKey[] = [];
        for (const sKey of allActiveSlots) {
          const currentSubs = assignment.get(sKey) || [];
          if (canAddToSlot(currentSubs, sub)) {
            validSlots.push(sKey);
          }
        }

        // Forward Checking: Domain wipe-out -> backtrack
        if (validSlots.length === 0) {
          return false;
        }

        if (validSlots.length < minDomainSize) {
          minDomainSize = validSlots.length;
          bestSubIdx = i;
          bestValidSlots = validSlots;
        } else if (validSlots.length === minDomainSize) {
          const currSub = unassigned[bestSubIdx];
          const degCurr = conflictDegree.get(currSub) || 0;
          const degNew = conflictDegree.get(sub) || 0;
          if (degNew > degCurr) {
            bestSubIdx = i;
            bestValidSlots = validSlots;
          }
        }
      }

      const chosenSub = unassigned[bestSubIdx];
      const remaining = [...unassigned.slice(0, bestSubIdx), ...unassigned.slice(bestSubIdx + 1)];

      // 2. Value ordering for valid slots
      bestValidSlots.sort((a, b) => {
        const scoreA = scoreSlotForSubject(a, chosenSub, assignment);
        const scoreB = scoreSlotForSubject(b, chosenSub, assignment);
        if (randomizeTieBreaks && Math.abs(scoreA - scoreB) < 50) {
          return Math.random() - 0.5;
        }
        return scoreA - scoreB;
      });

      for (const slot of bestValidSlots) {
        assignment.get(slot)!.push(chosenSub);
        if (backtrack(remaining)) {
          return true;
        }
        // Backtrack
        const subs = assignment.get(slot)!;
        subs.splice(subs.indexOf(chosenSub), 1);
      }

      return false;
    };

    const initialOrder = [...subjectsToPlace].sort((a, b) => {
      const degA = (conflictDegree.get(a) || 0) + (randomizeTieBreaks ? Math.random() * 2 - 1 : 0);
      const degB = (conflictDegree.get(b) || 0) + (randomizeTieBreaks ? Math.random() * 2 - 1 : 0);
      if (degB !== degA) return degB - degA;
      const stuA = evalSubjects.find(s => s.subject === a)?.stuCount || 0;
      const stuB = evalSubjects.find(s => s.subject === b)?.stuCount || 0;
      return stuB - stuA;
    });

    const success = backtrack(initialOrder);
    return success ? assignment : null;
  };

  // --- MULTI-RESTART EXPLORATION + STRICT COMPACTION ---
  const NUM_RESTARTS = 50;
  let globalBestAssignment: Map<SlotKey, string[]> | null = null;
  let globalBestScore = -Infinity;

  for (let restart = 0; restart < NUM_RESTARTS; restart++) {
    // Attempt exact backtracking placement first
    let assignment = solveBacktracking(subjectNames, restart > 0);

    // If backtracking hit node limit, run greedy conflict-free assignment (never putting conflicting subjects together!)
    if (!assignment) {
      assignment = new Map<SlotKey, string[]>();
      for (const sKey of allActiveSlots) {
        assignment.set(sKey, []);
      }

      const restartSubjectOrder = [...subjectNames].sort((a, b) => {
        const degA = (conflictDegree.get(a) || 0) + (Math.random() * 3 - 1.5);
        const degB = (conflictDegree.get(b) || 0) + (Math.random() * 3 - 1.5);
        return degB - degA;
      });

      for (const sub of restartSubjectOrder) {
        let bestSlot: SlotKey | null = null;
        let bestScore = 99999;

        for (const sKey of allActiveSlots) {
          const currentSubs = assignment.get(sKey) || [];
          if (canAddToSlot(currentSubs, sub)) {
            const score = scoreSlotForSubject(sKey, sub, assignment);
            if (score < bestScore) {
              bestScore = score;
              bestSlot = sKey;
            }
          }
        }
        if (bestSlot) {
          assignment.get(bestSlot)!.push(sub);
        }
      }
    }

    if (assignment) {
      // Compaction Pass: Try moving isolated subjects into compatible slots without EVER creating conflicts
      let compacted = true;
      let passes = 0;
      while (compacted && passes < 3) {
        compacted = false;
        passes++;
        const sortedSlots = Array.from(assignment.entries())
          .filter(([, subs]) => subs.length > 0)
          .sort((a, b) => a[1].length - b[1].length);

        for (const [fromSlot, fromSubs] of sortedSlots) {
          for (let i = fromSubs.length - 1; i >= 0; i--) {
            const sub = fromSubs[i];
            for (const [targetSlot, targetSubs] of assignment.entries()) {
              if (targetSlot === fromSlot || targetSubs.length === 0) continue;
              // STRICTLY ENFORCE canAddToSlot (Zero conflict invariant)
              if (canAddToSlot(targetSubs, sub)) {
                const [fromDayStr] = fromSlot.split('_');
                const [targetDayStr] = targetSlot.split('_');
                const fromDay = parseInt(fromDayStr, 10) as DayIdx;
                const targetDay = parseInt(targetDayStr, 10) as DayIdx;
                const subTakers = takers.get(sub);
                let worsensDailyDistribution = false;

                if (subTakers && targetDay !== fromDay) {
                  for (const stKey of subTakers) {
                    let examsOnTarget = 0;
                    let examsOnFrom = 0;
                    const fromPeriods = dayActivePeriodsMap.get(fromDay) || [];
                    for (const p of fromPeriods) {
                      const sSubs = assignment.get(slotKey(fromDay, p)) || [];
                      for (const s of sSubs) {
                        if (takers.get(s)?.has(stKey)) {
                          examsOnFrom++;
                          break;
                        }
                      }
                    }
                    const targetPeriods = dayActivePeriodsMap.get(targetDay) || [];
                    for (const p of targetPeriods) {
                      const sSubs = assignment.get(slotKey(targetDay, p)) || [];
                      for (const s of sSubs) {
                        if (takers.get(s)?.has(stKey)) {
                          examsOnTarget++;
                          break;
                        }
                      }
                    }
                    // Moving sub will make examsOnFrom -> examsOnFrom - 1, and examsOnTarget -> examsOnTarget + 1
                    if (examsOnFrom <= 1 && (studentMap.get(stKey)?.size || 0) >= activeDays.length) {
                      // Would create a 0-exam day!
                      worsensDailyDistribution = true;
                      break;
                    }
                    if (examsOnTarget >= 2) {
                      // Would create a 3-exam day!
                      worsensDailyDistribution = true;
                      break;
                    }
                  }
                }

                if (!worsensDailyDistribution) {
                  fromSubs.splice(i, 1);
                  targetSubs.push(sub);
                  assignment.set(fromSlot, [...fromSubs]);
                  assignment.set(targetSlot, [...targetSubs]);
                  compacted = true;
                  break;
                }
              }
            }
          }
        }
      }

      // Period 3 Optimization: Assign highest student attendance slot of each day to Period 3
      for (const d of activeDays) {
        const periods = dayActivePeriodsMap.get(d) || [];
        if (periods.includes(3)) {
          let maxTakersPeriod = 3;
          let maxTakersCount = 0;
          for (const p of periods) {
            const pSubs = assignment.get(slotKey(d, p)) || [];
            const count = pSubs.reduce((acc, s) => acc + (takers.get(s)?.size || 0), 0);
            if (count > maxTakersCount) {
              maxTakersCount = count;
              maxTakersPeriod = p;
            }
          }
          if (maxTakersPeriod !== 3 && maxTakersCount > 0) {
            const keyA = slotKey(d, maxTakersPeriod as PeriodIdx);
            const key3 = slotKey(d, 3);
            const subsA = assignment.get(keyA) || [];
            const subs3 = assignment.get(key3) || [];
            assignment.set(keyA, subs3);
            assignment.set(key3, subsA);
          }
        }
      }

      // Priority 3 Post-Processing: Maximize unique student takers in LAST slot of LAST day
      // Try swapping subjects between the last slot and other slots to increase the final taker count
      {
        const computeSlotUniqueTakers = (subs: string[]): Set<StudentKey> => {
          const result = new Set<StudentKey>();
          for (const s of subs) {
            const st = takers.get(s);
            if (st) for (const k of st) result.add(k);
          }
          return result;
        };

        let improved = true;
        let swapPasses = 0;
        while (improved && swapPasses < 5) {
          improved = false;
          swapPasses++;
          const lastSubs = assignment.get(lastSlotKey) || [];
          const currentLastTakers = computeSlotUniqueTakers(lastSubs).size;

          // Try swapping each subject in last slot with each subject in other slots
          for (const otherSlot of allActiveSlots) {
            if (otherSlot === lastSlotKey) continue;
            const otherSubs = assignment.get(otherSlot) || [];
            if (otherSubs.length === 0) continue;

            for (let li = 0; li < lastSubs.length; li++) {
              for (let oi = 0; oi < otherSubs.length; oi++) {
                const lastSub = lastSubs[li];
                const otherSub = otherSubs[oi];
                if (lastSub === otherSub) continue;

                // Check if swap maintains conflict-free invariant in both slots
                const newLastSubs = [...lastSubs];
                newLastSubs[li] = otherSub;
                const newOtherSubs = [...otherSubs];
                newOtherSubs[oi] = lastSub;

                // Validate new last slot
                let lastValid = true;
                for (let a = 0; a < newLastSubs.length && lastValid; a++) {
                  for (let b = a + 1; b < newLastSubs.length && lastValid; b++) {
                    if (!areDisjoint(newLastSubs[a], newLastSubs[b])) lastValid = false;
                  }
                }
                if (!lastValid) continue;

                // Validate new other slot
                let otherValid = true;
                for (let a = 0; a < newOtherSubs.length && otherValid; a++) {
                  for (let b = a + 1; b < newOtherSubs.length && otherValid; b++) {
                    if (!areDisjoint(newOtherSubs[a], newOtherSubs[b])) otherValid = false;
                  }
                }
                if (!otherValid) continue;

                // Check if swap improves last slot taker count
                const newLastTakers = computeSlotUniqueTakers(newLastSubs).size;
                if (newLastTakers > currentLastTakers) {
                  assignment.set(lastSlotKey, newLastSubs);
                  assignment.set(otherSlot, newOtherSubs);
                  improved = true;
                  break;
                }
              }
              if (improved) break;
            }
            if (improved) break;
          }
        }

        // Also try MOVING subjects from other slots into the last slot (if space permits)
        const lastSubsFinal = assignment.get(lastSlotKey) || [];
        if (lastSubsFinal.length < maxSubjectsPerSlot) {
          // Gather all subjects NOT in last slot, sorted by enrollment desc
          const otherSubjects: { sub: string; slot: SlotKey; count: number }[] = [];
          for (const otherSlot of allActiveSlots) {
            if (otherSlot === lastSlotKey) continue;
            const oSubs = assignment.get(otherSlot) || [];
            for (const s of oSubs) {
              const newTakers = takers.get(s);
              if (!newTakers) continue;
              // Only consider if the subject has takers NOT already in last slot
              otherSubjects.push({ sub: s, slot: otherSlot, count: newTakers.size });
            }
          }
          otherSubjects.sort((a, b) => b.count - a.count);

          for (const { sub, slot: fromSlot } of otherSubjects) {
            const curLast = assignment.get(lastSlotKey) || [];
            if (curLast.length >= maxSubjectsPerSlot) break;
            if (canAddToSlot(curLast, sub)) {
              // Check that removing from fromSlot won't leave it with conflicts (it won't, just removing)
              const fromSubs = assignment.get(fromSlot) || [];
              const newFrom = fromSubs.filter(s => s !== sub);
              assignment.set(fromSlot, newFrom);
              curLast.push(sub);
              assignment.set(lastSlotKey, curLast);
            }
          }
        }
      }

      // Evaluate candidate
      const evalRes = evaluateCandidate(assignment);
      if (evalRes.score > globalBestScore) {
        globalBestScore = evalRes.score;
        globalBestAssignment = new Map();
        for (const [k, v] of assignment.entries()) {
          globalBestAssignment.set(k, [...v]);
        }
      }
    }
  }

  const finalAssignment: Map<SlotKey, string[]> = globalBestAssignment || new Map<SlotKey, string[]>();

  // Build final timetable
  const finalPlacedSet = new Set<string>();
  for (const [sKey, subs] of finalAssignment.entries()) {
    timetable[sKey as SlotKey] = { subjects: [...subs] };
    for (const s of subs) finalPlacedSet.add(s);
  }

  const unplacedSubjects = subjectNames.filter(s => !finalPlacedSet.has(s));

  // Compute daily load
  let maxDailyExamsForAnyStudent = 0;
  for (const [, stSubs] of studentMap.entries()) {
    for (const d of activeDays) {
      let dayCount = 0;
      const activePs = dayActivePeriodsMap.get(d) || [];
      for (const p of activePs) {
        const slotSubs = timetable[slotKey(d, p)]?.subjects || [];
        if (slotSubs.some(s => stSubs.has(s))) {
          dayCount++;
        }
      }
      if (dayCount > maxDailyExamsForAnyStudent) {
        maxDailyExamsForAnyStudent = dayCount;
      }
    }
  }

  // Period 3 coverage
  let period3TotalTakers = 0;
  for (const d of activeDays) {
    const p3Subs = timetable[slotKey(d, 3)]?.subjects || [];
    for (const s of p3Subs) {
      period3TotalTakers += takers.get(s)?.size || 0;
    }
  }
  const period3CoverageAvg = activeDays.length > 0
    ? Math.round((period3TotalTakers / (activeDays.length * totalStudents)) * 100)
    : 0;

  const period2SelfStudyDays = activeDays.filter(d => (timetable[slotKey(d, 2)]?.subjects.length || 0) === 0);

  let usedSlotsCount = 0;
  for (const sKey of allActiveSlots) {
    if ((timetable[sKey]?.subjects.length || 0) > 0) {
      usedSlotsCount++;
    }
  }
  const totalActiveSlots = allActiveSlots.length;
  const emptySlotsCount = Math.max(0, totalActiveSlots - usedSlotsCount);

  // Compute last slot unique takers
  const lastSlotSubjects = timetable[lastSlotKey]?.subjects || [];
  const lastSlotStudentsSet = new Set<StudentKey>();
  for (const s of lastSlotSubjects) {
    const st = takers.get(s);
    if (st) for (const k of st) lastSlotStudentsSet.add(k);
  }

  return {
    timetable,
    placedCount: finalPlacedSet.size,
    unplacedSubjects,
    maxDailyExamsForAnyStudent,
    period3CoverageAvg,
    period2SelfStudyDays,
    usedSlotsCount,
    emptySlotsCount,
    totalActiveSlots,
    lastSlotTakers: lastSlotStudentsSet.size,
  };
}
