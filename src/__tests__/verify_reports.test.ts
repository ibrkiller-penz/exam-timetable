/**
 * 11번 인쇄물 전체 검증 — 원자료(나이스) ↔ 응시현황 ↔ 각 인쇄물.
 *
 * 실제 저장 상태(exam_saves/latest 를 내려받은 JSON)를 놓고,
 *  A. 나이스 원자료에서 다시 만든 학생·분반이 저장된 것과 같은지
 *  B. 응시현황이 스스로 모순이 없는지 (빠진 시험·잘못 앉은 학생·좌석 중복·정원)
 *  C. 11-1 ~ 11-8 을 만드는 함수가 응시현황과 어긋나지 않는지
 * 를 봅니다.
 *
 * 실행:
 *   node scripts/fetch-state.cjs <저장할 경로>          ← 서버 상태를 내려받습니다
 *   STATE_DUMP=<그 경로> npx vitest run src/__tests__/verify_reports.test.ts
 * 파일이 없으면 통째로 건너뜁니다(학생 자료는 저장소에 두지 않습니다).
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { normalizeNeisRooms, buildSubjectTables } from '../domain/baseData';
import { buildStudents } from '../domain/subjects';
import { subjectBanEntries } from '../domain/placement';
import { buildPlacementInfo } from '../domain/placementInfo';
import { applySeparate, isTakingRow } from '../domain/separate';
import { isWaitCell, isUsableRoom } from '../domain/types';
import type { AppState, AttendanceRow, DayIdx, PeriodIdx, DayLabel, PeriodLabel } from '../domain/types';
import { onlySubject, hakbun } from '../domain/util/text';
import { buildGradeTable } from '../domain/reports/gradeTable';
import { buildExamRoomReport } from '../domain/reports/examRoom';
import { buildRoomTimetableReport } from '../domain/reports/roomTimetable';
import { buildSeatMapReport, calcPhysicalSeatNum } from '../domain/reports/seatMap';
import { buildClassTableReport } from '../domain/reports/classTable';
import { buildStudentTableReport } from '../domain/reports/studentTable';
import { buildLabels } from '../domain/reports/labels';
import { buildSeparateRosters, buildSeparateSheets } from '../domain/reports/separateReport';

const DUMP = process.env.STATE_DUMP;
const state: AppState | null = DUMP && existsSync(DUMP) ? JSON.parse(readFileSync(DUMP, 'utf-8')) : null;

/** 어긋난 것을 모아 두었다가 한 번에 보여 줍니다. 하나씩 터지면 전체 그림이 안 보입니다. */
const collect = (name: string, problems: string[], extra?: Record<string, unknown>) => {
  const head = `[${name}] ${problems.length}건${extra ? ' ' + JSON.stringify(extra) : ''}`;
  console.log(head + (problems.length ? '\n  ' + problems.slice(0, 25).join('\n  ') + (problems.length > 25 ? `\n  … 외 ${problems.length - 25}건` : '') : ''));
  expect(problems, head).toEqual([]);
};

describe.skipIf(!state)('11번 인쇄물 — 원자료·응시현황·인쇄물 검증', () => {
  const s = state!;
  const rooms = s.rooms;
  const usable = rooms.filter(isUsableRoom);
  const roomById = new Map(rooms.map(r => [r.id, r]));
  const roomByName = new Map(rooms.map(r => [r.roomName, r]));
  const slots = buildPlacementInfo(s.timetable || {}, s.students || [], s.evalSubjects || []);
  const entries = subjectBanEntries(s.subjectBans || []);
  const allDay = s.settings?.separateRoomAllDay ?? false;
  const attendance = applySeparate(s.attendance, slots, s.separateExaminers, allDay);
  const key = (ban: string, num: number) => `${ban}-${num}`;
  const slotLabel = (i: number) => {
    const ps = slots.find(p => p.index === i)!;
    return { day: `${ps.day}일차` as DayLabel, period: `${ps.period}교시` as PeriodLabel, ps };
  };
  const rowsAt = (day: DayLabel, period: PeriodLabel, room?: string) =>
    attendance.filter(r => r.day === day && r.period === period && (room === undefined || r.examRoom === room));
  const cellSubject = (v: string) => { const h = v.lastIndexOf('-'); return h === -1 ? v.trim() : v.slice(0, h).trim(); };

  it('개요', () => {
    console.log(JSON.stringify({
      students: s.students.length, rooms: rooms.length, usable: usable.length, slots: slots.length,
      attendance: attendance.length, evalSubjects: s.evalSubjects.length,
      separate: s.separateExaminers, allDay,
    }));
    expect(slots.length).toBeGreaterThan(0);
  });

  // ── A. 원자료(나이스) ↔ 저장된 학생·분반 ─────────────────────────────
  it('A1. 나이스에서 다시 만든 학생 명단·수강 과목이 저장된 것과 같다', () => {
    const norm = normalizeNeisRooms(s.neis);
    const rebuilt = buildStudents(norm, s.evalSubjects);
    const saved = new Map(s.students.map(st => [key(st.ban, st.num), st]));
    // 저장된 학생에는 평가하지 않는 과목(1단계에서 전 과목으로 만든 것)까지 들어 있습니다.
    // 시험에 관계있는 것은 평가 과목뿐이므로 그것만 견줍니다.
    const evalSet = new Set(s.evalSubjects.map(e => e.subject));
    const evalOnly = (subs: string[]) => subs.filter(x => evalSet.has(x)).sort().join('|');
    const problems: string[] = [];
    if (rebuilt.length !== s.students.length) problems.push(`학생 수 다름: 나이스 ${rebuilt.length} vs 저장 ${s.students.length}`);
    for (const st of rebuilt) {
      const sv = saved.get(key(st.ban, st.num));
      if (!sv) { problems.push(`저장에 없음: ${st.ban} ${st.num}번`); continue; }
      const a = evalOnly(st.subjects), b = evalOnly(sv.subjects);
      if (a !== b) problems.push(`${st.ban} ${st.num}번 평가과목 다름: 나이스 [${a}] vs 저장 [${b}]`);
    }
    collect('A1', problems, { 나이스행: s.neis.length, 학생: rebuilt.length });
  });

  it('A2. 나이스에서 다시 만든 과목-분반 인원표가 저장된 것과 같다', () => {
    const norm = normalizeNeisRooms(s.neis);
    const { subjectBans } = buildSubjectTables(norm, 1);
    const re = subjectBanEntries(subjectBans);
    const problems: string[] = [];
    for (const [k, e] of entries) {
      const r = re.get(k);
      if (!r) problems.push(`나이스에 없는 분반: ${k}`);
      else if (r.stuCount !== e.stuCount) problems.push(`${k} 인원 다름: 나이스 ${r.stuCount} vs 저장 ${e.stuCount}`);
    }
    for (const k of re.keys()) if (!entries.has(k)) problems.push(`저장에 없는 분반: ${k}`);
    collect('A2', problems, { 분반: entries.size });
  });

  // ── B. 응시현황 자체 정합성 ────────────────────────────────────────────
  it('B1. 학생마다 교시마다 정확히 한 줄', () => {
    const problems: string[] = [];
    const seen = new Set<string>();
    for (const r of attendance) {
      if (seen.has(r.key3)) problems.push(`중복 줄: ${r.key3}`);
      seen.add(r.key3);
    }
    for (const st of s.students) for (const ps of slots) {
      const k3 = `${st.ban}${st.num}번${ps.day}일차${ps.period}교시`;
      if (!seen.has(k3)) problems.push(`줄 없음: ${k3}`);
    }
    if (attendance.length !== s.students.length * slots.length)
      problems.push(`줄 수 ${attendance.length} ≠ 학생 ${s.students.length} × 교시 ${slots.length}`);
    collect('B1', problems, { 줄: attendance.length });
  });

  it('B2/B3. 빠진 시험 없음 · 안 듣는 과목 응시 없음 · 그 교시에 없는 과목 없음', () => {
    const problems: string[] = [];
    const stuBy = new Map(s.students.map(st => [key(st.ban, st.num), st]));
    for (const r of attendance) {
      const st = stuBy.get(key(r.ban, r.num));
      if (!st) { problems.push(`학생 아님: ${r.key3}`); continue; }
      const ps = slots.find(p => `${p.day}일차` === r.day && `${p.period}교시` === r.period);
      if (!ps) { problems.push(`교시 없음: ${r.key3}`); continue; }
      const should = ps.subjects.filter(sub => st.subjects.includes(sub));
      if (should.length > 1) problems.push(`한 교시에 두 과목 수강: ${r.key3} ${should.join(',')}`);
      if (isTakingRow(r)) {
        if (!st.subjects.includes(r.subject)) problems.push(`안 듣는 과목 응시: ${r.key3} ${r.subject}`);
        if (!ps.subjects.includes(r.subject)) problems.push(`이 교시에 없는 과목: ${r.key3} ${r.subject}`);
        if (should.length && should[0] !== r.subject) problems.push(`다른 과목 응시: ${r.key3} ${r.subject} (들어야 할 ${should[0]})`);
      } else if (should.length) {
        problems.push(`시험 빠짐: ${r.key3} 들어야 할 ${should[0]} 인데 '${r.subject}'`);
      }
    }
    collect('B2/B3', problems);
  });

  it('B4. 앉은 고사실이 8단계 배치·7단계 칸과 맞다', () => {
    const problems: string[] = [];
    for (const r of attendance) {
      const ps = slots.find(p => `${p.day}일차` === r.day && `${p.period}교시` === r.period)!;
      const placedRoomId = s.studentPlacements?.[ps.index]?.[key(r.ban, r.num)];
      const placedRoom = placedRoomId ? roomById.get(placedRoomId) : undefined;
      if (placedRoom && placedRoom.roomName !== r.examRoom)
        problems.push(`고사실 다름: ${r.key3} 응시현황 ${r.examRoom} vs 배치 ${placedRoom.roomName}`);
      const roomObj = roomByName.get(r.examRoom);
      if (!roomObj) { problems.push(`없는 고사실: ${r.key3} ${r.examRoom}`); continue; }
      const cell = s.placement?.[ps.index]?.[roomObj.id] ?? '';
      if (isTakingRow(r)) {
        if (cellSubject(cell) !== r.subject) problems.push(`칸 과목 다름: ${r.key3} ${r.examRoom} 칸 '${cell}' vs ${r.subject}`);
      } else if (cell && !isWaitCell(cell)) {
        problems.push(`대기 학생이 시험 칸에: ${r.key3} ${r.examRoom} 칸 '${cell}'`);
      }
    }
    collect('B4', problems);
  });

  it('B5. 고사실·교시마다 좌석이 1..N 으로 빈틈·중복 없이', () => {
    const problems: string[] = [];
    const warn: string[] = [];
    for (const ps of slots) {
      const { day, period } = slotLabel(ps.index);
      for (const rm of usable) {
        const rows = rowsAt(day, period, rm.roomName);
        if (!rows.length) continue;
        const seated = rows.filter(r => !r.separateRoom);
        const seats = seated.map(r => r.seat);
        if (seats.some(x => x === null)) problems.push(`좌석 없음: ${day} ${period} ${rm.roomName} ${seats.filter(x => x === null).length}명`);
        const nums = seats.filter((x): x is number => x !== null).sort((a, b) => a - b);
        const expected = nums.map((_, i) => i + 1);
        if (nums.join(',') !== expected.join(',')) problems.push(`좌석 어긋남: ${day} ${period} ${rm.roomName} [${nums.join(',')}]`);
        const sep = rows.filter(r => r.separateRoom);
        if (sep.some(r => r.seat !== null)) problems.push(`별도 응시자에 좌석 있음: ${day} ${period} ${rm.roomName}`);
        if (rm.capacity > 0 && seated.length > rm.capacity) warn.push(`정원 초과: ${day} ${period} ${rm.roomName} ${seated.length}/${rm.capacity}`);
      }
    }
    if (warn.length) console.log('[B5 정원 참고]\n  ' + warn.join('\n  '));
    collect('B5', problems);
  });

  // ── C. 인쇄물마다 응시현황과 비교 ────────────────────────────────────
  it('C1. 11-1 전체 시험시간표: 칸의 과목·인원이 배치·응시현황과 맞다', () => {
    const { columns, rows } = buildGradeTable(rooms, s.days, s.times, slots, s.placement, entries);
    const problems: string[] = [];
    rows.forEach((row, i) => {
      const ps = slots[i];
      const { day, period } = slotLabel(ps.index);
      columns.forEach((c, ci) => {
        const cell = row.cells[ci];
        const att = rowsAt(day, period, c.roomName);
        const v = s.placement?.[ps.index]?.[c.id] ?? '';
        if (!v || v === '배치금지') { if (att.length) problems.push(`${day} ${period} ${c.roomName}: 빈 칸인데 응시현황 ${att.length}명`); return; }
        if (typeof cell.stuCount === 'number' && cell.stuCount !== att.length)
          problems.push(`${day} ${period} ${c.roomName}: 표 인원 ${cell.stuCount} vs 응시현황 ${att.length}`);
        if (!isWaitCell(v) && att.length && cellSubject(v) !== att[0].subject)
          problems.push(`${day} ${period} ${c.roomName}: 칸 '${v}' vs 응시현황 ${att[0].subject}`);
      });
      const total = columns.reduce((acc, c) => acc + rowsAt(day, period, c.roomName).length, 0);
      if (row.totalStuCount !== total) problems.push(`${day} ${period} 인원계 ${row.totalStuCount} vs 응시현황 ${total}`);
    });
    collect('C1 11-1', problems, { 행: rows.length, 열: columns.length });
  });

  it('C2. 11-2 고사실 명단: 인원·연번·좌석이 응시현황과 맞다', () => {
    const problems: string[] = [];
    let sheets = 0;
    for (const ps of slots) {
      const { day, period } = slotLabel(ps.index);
      for (const rm of usable) {
        const rep = buildExamRoomReport(attendance, day, period, rm.roomName, rooms);
        const att = rowsAt(day, period, rm.roomName);
        if (!rep) { if (att.length) problems.push(`${day} ${period} ${rm.roomName}: 명단 없음인데 ${att.length}명`); continue; }
        sheets++;
        const seated = att.filter(r => !r.separateRoom);
        if (rep.totalStudents !== att.length) problems.push(`${day} ${period} ${rm.roomName}: 총원 ${rep.totalStudents} vs ${att.length}`);
        if (rep.students.length !== seated.length) problems.push(`${day} ${period} ${rm.roomName}: 명단 ${rep.students.length} vs 앉는 인원 ${seated.length}`);
        if (rep.separate.length !== att.length - seated.length) problems.push(`${day} ${period} ${rm.roomName}: 별도 ${rep.separate.length} vs ${att.length - seated.length}`);
        rep.students.forEach((x, i) => { if (x.seq !== i + 1) problems.push(`${day} ${period} ${rm.roomName}: 연번 ${x.seq} ≠ ${i + 1}`); });
        const cols = rm.cols || 5;
        const phys = rep.students.map(x => x.seat).filter((x): x is number => x !== null);
        if (new Set(phys).size !== phys.length) problems.push(`${day} ${period} ${rm.roomName}: 좌석 중복 [${phys.join(',')}]`);
        const expectPhys = seated.map(r => calcPhysicalSeatNum(r.seat!, cols, seated.length, rm.layoutDirection || 'col', rm.rows)).sort((a, b) => a - b);
        if ([...phys].sort((a, b) => a - b).join(',') !== expectPhys.join(',')) problems.push(`${day} ${period} ${rm.roomName}: 좌석 번호가 응시현황 좌석과 다름`);
        const hak = new Set(rep.students.map(x => x.hakbun));
        for (const r of seated) if (!hak.has(hakbun(r.grade, r.ban, r.num))) problems.push(`${day} ${period} ${rm.roomName}: ${r.key3} 명단에 없음`);
      }
    }
    collect('C2 11-2', problems, { 장: sheets });
  });

  it('C3. 11-3 고사실 시간표: 칸마다 과목·응시자수·별도 인원이 맞다', () => {
    const problems: string[] = [];
    for (const rm of usable) {
      const rep = buildRoomTimetableReport(rm, attendance, s.days, s.times);
      for (const p of rep.activePeriods) for (const d of rep.activeDays) {
        const cell = rep.grid[p][d.day];
        const att = rowsAt(`${d.day}일차`, `${p}교시`, rm.roomName);
        const sep = att.filter(r => r.separateRoom).length;
        if (!att.length) { if (typeof cell.stuCount === 'number' && cell.subject !== '자습') problems.push(`${rm.roomName} ${d.day}일차 ${p}교시: 응시현황 없는데 ${cell.subject} ${cell.stuCount}`); continue; }
        if (cell.stuCount !== att.length - sep) problems.push(`${rm.roomName} ${d.day}일차 ${p}교시: 응시자수 ${cell.stuCount} vs ${att.length - sep}`);
        if (cell.separateCount !== sep) problems.push(`${rm.roomName} ${d.day}일차 ${p}교시: 별도 ${cell.separateCount} vs ${sep}`);
        const expectSubj = att[0].subject === '미응시' ? '대기실' : att[0].subject;
        if (cell.subject !== expectSubj) problems.push(`${rm.roomName} ${d.day}일차 ${p}교시: 과목 '${cell.subject}' vs '${expectSubj}'`);
      }
    }
    collect('C3 11-3', problems, { 고사실: usable.length });
  });

  it('C4. 11-4 좌석배치도: 앉는 학생마다 제 좌석에 한 번씩, 빈 자리 수가 맞다', () => {
    const problems: string[] = [];
    let maps = 0;
    for (const ps of slots) {
      const { day, period } = slotLabel(ps.index);
      for (const rm of usable) {
        const att = rowsAt(day, period, rm.roomName);
        const seated = att.filter(r => !r.separateRoom);
        const cols = rm.cols || s.settings.seatColumns || 5;
        const rep = buildSeatMapReport(attendance, day, period, rm.roomName, cols, rm.layoutDirection || 'col', rm.rows || s.settings.seatsPerColumn);
        if (!rep) { if (seated.length) problems.push(`${day} ${period} ${rm.roomName}: 배치도 없음인데 ${seated.length}명`); continue; }
        maps++;
        const cells = rep.grid.flat();
        const occ = cells.filter(c => c.occupied);
        if (occ.length !== seated.length) problems.push(`${day} ${period} ${rm.roomName}: 앉은 칸 ${occ.length} vs ${seated.length}명`);
        if (rep.totalStudents !== seated.length) problems.push(`${day} ${period} ${rm.roomName}: 응시인원 ${rep.totalStudents} vs ${seated.length}`);
        const byHak = new Map(occ.map(c => [c.hakbun, c]));
        for (const r of seated) {
          const c = byHak.get(hakbun(r.grade, r.ban, r.num));
          if (!c) { problems.push(`${day} ${period} ${rm.roomName}: ${r.key3} 자리 없음`); continue; }
          if (c.seat !== r.seat) problems.push(`${day} ${period} ${rm.roomName}: ${r.key3} 좌석 ${c.seat} vs ${r.seat}`);
          if (c.physicalSeatNum < 1 || c.physicalSeatNum > cols * rep.rowsPerColumn) problems.push(`${day} ${period} ${rm.roomName}: ${r.key3} 자리번호 ${c.physicalSeatNum} 범위 밖`);
        }
        const ids = occ.map(c => c.hakbun);
        if (new Set(ids).size !== ids.length) problems.push(`${day} ${period} ${rm.roomName}: 같은 학생이 두 자리`);
      }
    }
    collect('C4 11-4', problems, { 배치도: maps });
  });

  it('C5. 11-5 학급 시간표: 학생·교시마다 과목·고사실이 응시현황과 맞다', () => {
    const problems: string[] = [];
    const bans = [...new Set(s.students.map(st => st.ban))];
    const dayList = [...new Set(slots.map(p => p.day))] as DayIdx[];
    for (const ban of bans) for (const d of dayList) {
      const rep = buildClassTableReport(ban, d, s.students, attendance, s.days, s.times, rooms);
      for (const row of rep.students) for (const p of rep.activePeriods) {
        const att = attendance.find(a => a.key3 === `${ban}${row.num}번${d}일차${p}교시`);
        const cell = row.periods[p as PeriodIdx];
        if (!att) { if (cell.subject !== '자습') problems.push(`${ban} ${row.num}번 ${d}일차 ${p}교시: 줄 없는데 '${cell.subject}'`); continue; }
        const es = att.subject === '미응시' ? '미응시' : onlySubject(att.subject);
        const er = att.separateRoom ? `${att.examRoom}(별)` : att.examRoom;
        if (cell.subject !== es) problems.push(`${ban} ${row.num}번 ${d}일차 ${p}교시: 과목 '${cell.subject}' vs '${es}'`);
        if (cell.room !== er) problems.push(`${ban} ${row.num}번 ${d}일차 ${p}교시: 고사실 '${cell.room}' vs '${er}'`);
      }
    }
    collect('C5 11-5', problems, { 반: bans.length, 일차: dayList.length });
  });

  it('C6. 11-6 개별 수험표: 학생마다 교시·과목·고사실·좌석이 맞고 빠진 과목이 없다', () => {
    const problems: string[] = [];
    for (const st of s.students) {
      const rep = buildStudentTableReport(st, attendance, s.days, s.times, rooms, slots, true);
      if (rep.unplacedSubjects.length) problems.push(`${st.ban} ${st.num}번: 수험표에 빠진 과목 ${rep.unplacedSubjects.join(',')}`);
      for (const p of rep.activePeriods) for (const d of rep.activeDays) {
        const att = attendance.find(a => a.key3 === `${st.ban}${st.num}번${d.day}일차${p}교시`);
        const cell = rep.grid[p][d.day];
        if (!att) continue;
        const es = att.subject === '미응시' ? '자습' : onlySubject(att.subject);
        const er = att.separateRoom ? `${att.examRoom}(별)` : att.examRoom;
        if (cell.subject !== es) problems.push(`${st.ban} ${st.num}번 ${d.day}일차 ${p}교시: 과목 '${cell.subject}' vs '${es}'`);
        if (cell.examRoom !== er) problems.push(`${st.ban} ${st.num}번 ${d.day}일차 ${p}교시: 고사실 '${cell.examRoom}' vs '${er}'`);
        if (att.seat === null && cell.seat !== null) problems.push(`${st.ban} ${st.num}번 ${d.day}일차 ${p}교시: 좌석 없는데 ${cell.seat}`);
        if (att.seat !== null && cell.seat === null) problems.push(`${st.ban} ${st.num}번 ${d.day}일차 ${p}교시: 좌석 ${att.seat} 인데 수험표엔 없음`);
      }
    }
    collect('C6 11-6', problems, { 학생: s.students.length });
  });

  it('C7. 11-7 봉투 라벨: 라벨마다 응시인원·별도 인원이 응시현황과 맞다', () => {
    const banCfg = { defaultStyle: s.settings.banLabelStyle, slotStyle: s.slotBanLabelStyle, manual: s.slotBanLabels };
    const labels = buildLabels(slots, s.placement, rooms, s.days, s.times, entries, banCfg, s.students, s.studentPlacements, s.separateExaminers);
    const problems: string[] = [];
    for (const l of labels) {
      const att = rowsAt(l.day, l.period, l.examRoom);
      const takers = att.filter(isTakingRow);
      const sep = takers.filter(r => r.separateRoom).length;
      // 봉투 라벨의 응시인원은 이 고사실에 배정된 전원(별도 응시자 포함)이고,
      // 그 아래에 '별도 N명 포함'을 따로 적습니다. 시험지는 전원 몫을 봉투에 넣고
      // 별도실 몫만 빼서 보내기 때문입니다. (11-3 은 반대로 앉는 인원만 적습니다.)
      if (l.stuCount !== takers.length) problems.push(`${l.day} ${l.period} ${l.examRoom}: 응시인원 ${l.stuCount} vs 배정 ${takers.length}`);
      if (l.separateCount !== sep) problems.push(`${l.day} ${l.period} ${l.examRoom}: 별도 ${l.separateCount} vs ${sep}`);
      if (att.length && onlySubject(l.subject) !== onlySubject(att[0].subject)) problems.push(`${l.day} ${l.period} ${l.examRoom}: 과목 '${l.subject}' vs '${att[0].subject}'`);
    }
    // 시험 칸인데 라벨이 없는 곳
    for (const ps of slots) {
      const { day, period } = slotLabel(ps.index);
      for (const rm of usable) {
        const v = s.placement?.[ps.index]?.[rm.id] ?? '';
        if (!v || isWaitCell(v) || v === '배치금지') continue;
        if (!labels.some(l => l.day === day && l.period === period && l.examRoom === rm.roomName)) problems.push(`${day} ${period} ${rm.roomName}: 시험 칸인데 라벨 없음`);
      }
    }
    collect('C7 11-7', problems, { 라벨: labels.length });
  });

  it('C8. 11-8 별도 수험생: 명렬·안내문이 응시현황의 별도 표시와 맞다', () => {
    const roomCount = Math.max(1, s.settings.separateRoomCount ?? 2);
    const examSlots = slots.filter(p => p.subjects.length > 0);
    const rosters = buildSeparateRosters(attendance, examSlots, roomCount);
    const problems: string[] = [];
    for (const ps of examSlots) {
      const { day, period } = slotLabel(ps.index);
      for (let room = 1; room <= roomCount; room++) {
        const att = attendance.filter(r => r.day === day && r.period === period && r.separateRoom === room);
        const ro = rosters.find(x => x.day === day && x.period === period && x.room === room);
        const a = att.map(r => hakbun(r.grade, r.ban, r.num)).sort().join(','), b = (ro?.rows ?? []).map(x => x.hakbun).sort().join(',');
        if (a !== b) problems.push(`${day} ${period} 별도 ${room}실: 응시현황 [${a}] vs 명렬 [${b}]`);
      }
    }
    const sheets = buildSeparateSheets(s.students, s.separateExaminers ?? {}, examSlots, s.studentPlacements ?? {}, s.placement, rooms);
    const designated = Object.keys(s.separateExaminers ?? {});
    if (sheets.length !== designated.length) problems.push(`안내문 ${sheets.length}장 vs 지정 ${designated.length}명`);
    for (const sh of sheets) {
      const takingSlots = attendance.filter(r => key(r.ban, r.num) === sh.key && r.separateRoom && isTakingRow(r));
      if (sh.rows.length !== takingSlots.length) problems.push(`${sh.key}: 안내문 ${sh.rows.length}교시 vs 응시현황 별도 ${takingSlots.length}교시`);
      for (const row of sh.rows) {
        const att = takingSlots.find(r => `${r.day} ${r.period}` === row.title.replace('일차', '일차 '));
        const att2 = att ?? takingSlots.find(r => `${r.day}${r.period}` === row.title.replace(/\s/g, ''));
        if (!att2) problems.push(`${sh.key}: 안내문 '${row.title}' 에 해당하는 별도 줄 없음`);
        else if (att2.subject !== row.subject) problems.push(`${sh.key} ${row.title}: 과목 '${row.subject}' vs '${att2.subject}'`);
        else if (att2.examRoom !== row.room) problems.push(`${sh.key} ${row.title}: 원고사실 '${row.room}' vs '${att2.examRoom}'`);
      }
    }
    collect('C8 11-8', problems, { 명렬: rosters.length, 안내문: sheets.length });
  });
});
