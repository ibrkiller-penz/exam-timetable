import { NeisRow, SubjectSummary, CompatGroup, Student, StudentKey, studentKey } from './types';
import { MAX_COMPAT } from './constants';
import { stableSort } from './util/sort';

export function buildTakers(
  neis: NeisRow[],
  evalSubjects: SubjectSummary[]
): Map<string, Set<StudentKey>> {
  const evalSet = new Set(evalSubjects.map(e => e.subject));
  const takers = new Map<string, Set<StudentKey>>();
  for (const e of evalSubjects) {
    takers.set(e.subject, new Set());
  }
  for (const r of neis) {
    if (evalSet.has(r.subject)) {
      takers.get(r.subject)!.add(studentKey(r));
    }
  }
  return takers;
}

function intersects(a?: Set<string>, b?: Set<string>): boolean {
  if (!a || !b) return false;
  if (a.size > b.size) {
    for (const x of b) {
      if (a.has(x)) return true;
    }
  } else {
    for (const x of a) {
      if (b.has(x)) return true;
    }
  }
  return false;
}

export function findCompatGroups(
  evalSubjects: SubjectSummary[],
  takers: Map<string, Set<StudentKey>>,
  totalStudents: number
): { groups: CompatGroup[]; overflow: boolean } {
  const S = evalSubjects.map(e => e.subject);
  const n = S.length;
  const groups: string[][] = [];
  let overflow = false;

  const pairDisjoint = new Map<string, boolean>();
  const isDisjoint = (a: string, b: string): boolean => {
    const key = a < b ? `${a}${b}` : `${b}${a}`;
    const cached = pairDisjoint.get(key);
    if (cached !== undefined) return cached;
    const res = !intersects(takers.get(a), takers.get(b));
    pairDisjoint.set(key, res);
    return res;
  };

  try {
    // 4-combinations
    for (let i = 0; i <= n - 4; i++) {
      for (let j = i + 1; j <= n - 3; j++) {
        if (!isDisjoint(S[i], S[j])) continue;
        for (let k = j + 1; k <= n - 2; k++) {
          if (!isDisjoint(S[i], S[k]) || !isDisjoint(S[j], S[k])) continue;
          for (let m = k + 1; m <= n - 1; m++) {
            if (
              isDisjoint(S[i], S[m]) &&
              isDisjoint(S[j], S[m]) &&
              isDisjoint(S[k], S[m])
            ) {
              groups.push([S[i], S[j], S[k], S[m]]);
              if (groups.length >= MAX_COMPAT) {
                overflow = true;
                throw new Error('STOP');
              }
            }
          }
        }
      }
    }

    // 3-combinations
    for (let i = 0; i <= n - 3; i++) {
      for (let j = i + 1; j <= n - 2; j++) {
        if (!isDisjoint(S[i], S[j])) continue;
        for (let k = j + 1; k <= n - 1; k++) {
          if (isDisjoint(S[i], S[k]) && isDisjoint(S[j], S[k])) {
            groups.push([S[i], S[j], S[k]]);
            if (groups.length >= MAX_COMPAT) {
              overflow = true;
              throw new Error('STOP');
            }
          }
        }
      }
    }

    // 2-combinations
    for (let i = 0; i <= n - 2; i++) {
      for (let j = i + 1; j <= n - 1; j++) {
        if (isDisjoint(S[i], S[j])) {
          groups.push([S[i], S[j]]);
          if (groups.length >= MAX_COMPAT) {
            overflow = true;
            throw new Error('STOP');
          }
        }
      }
    }
  } catch (e: any) {
    if (e.message !== 'STOP') throw e;
  }

  const subjectMap = new Map(evalSubjects.map(s => [s.subject, s]));
  const result: CompatGroup[] = groups.map(subs => {
    let banCount = 0;
    let stuCount = 0;
    for (const sub of subs) {
      const sObj = subjectMap.get(sub);
      if (sObj) {
        banCount += sObj.banCount;
        stuCount += sObj.stuCount;
      }
    }
    return {
      subjects: subs,
      banCount,
      stuCount,
      nonTakers: Math.max(0, totalStudents - stuCount),
    };
  });

  // 동시에 시험 많이 볼 수 있는 순 (응시 학생수 내림차순 -> 반수 내림차순 -> 과목수 내림차순)
  result.sort((a, b) => {
    if (b.stuCount !== a.stuCount) return b.stuCount - a.stuCount;
    if (b.banCount !== a.banCount) return b.banCount - a.banCount;
    return b.subjects.length - a.subjects.length;
  });

  return { groups: result, overflow };
}

export function buildStudents(neis: NeisRow[], evalSubjects: SubjectSummary[]): Student[] {
  const evalSet = new Set(evalSubjects.map(e => e.subject));
  const dic = new Map<StudentKey, Student>();

  for (const r of neis) {
    if (!evalSet.has(r.subject)) continue;
    const k = studentKey(r);
    const existing = dic.get(k);
    if (!existing) {
      dic.set(k, {
        grade: r.grade,
        ban: r.ban,
        num: r.num,
        name: r.name,
        subjects: [r.subject],
      });
    } else if (!existing.subjects.includes(r.subject)) {
      existing.subjects.push(r.subject);
    }
  }

  const list = Array.from(dic.values());
  return stableSort(list, (a, b) => {
    if (a.ban !== b.ban) return a.ban < b.ban ? -1 : 1;
    return a.num - b.num;
  });
}
