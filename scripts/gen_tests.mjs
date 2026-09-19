import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function write(relPath, content) {
  const fullPath = path.join(__dirname, '..', relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content.trim() + '\n', 'utf8');
  console.log('Wrote ' + relPath);
}

// 1. makeNeisFixture.ts
write('test/fixtures/makeNeisFixture.ts', `
import * as XLSX from 'xlsx';
import { NeisRow } from '../../src/domain/types';

export function makeNeisRows(opts: { pad?: boolean; includeInvalid?: boolean } = {}): NeisRow[] {
  const rows: NeisRow[] = [];
  const banCount = opts.pad === false ? 9 : 12;

  for (let b = 1; b <= banCount; b++) {
    const banStr = \`\${b}반\`;
    for (let num = 1; num <= 25; num++) {
      const name = \`학생\${String((b - 1) * 25 + num).padStart(3, '0')}\`;

      // 국어, 수학, 사회 (12분반 7차일반 b)
      rows.push({
        year: '2026',
        semester: '2',
        grade: '1',
        curriculum: '일반',
        subject: '공통국어2(4)',
        room: \`7차일반 \${b}\`,
        track: '보통과/1학년/',
        ban: banStr,
        num,
        name,
        room2: \`7차일반 \${b}\`,
      });

      rows.push({
        year: '2026',
        semester: '2',
        grade: '1',
        curriculum: '일반',
        subject: '공통수학2(4)',
        room: \`7차일반 \${b}\`,
        track: '보통과/1학년/',
        ban: banStr,
        num,
        name,
        room2: \`7차일반 \${b}\`,
      });

      rows.push({
        year: '2026',
        semester: '2',
        grade: '1',
        curriculum: '일반',
        subject: '통합사회2(3)',
        room: \`7차일반 \${b}\`,
        track: '보통과/1학년/',
        ban: banStr,
        num,
        name,
        room2: \`7차일반 \${b}\`,
      });

      // 한국사(홀수) / 정보(짝수)
      if (num % 2 === 1) {
        const subGroup = ((b - 1) % 6) + 1;
        rows.push({
          year: '2026',
          semester: '2',
          grade: '1',
          curriculum: '일반',
          subject: '한국사(3)',
          room: \`이동수업 \${String.fromCharCode(64 + subGroup)}\`,
          track: '보통과/1학년/',
          ban: banStr,
          num,
          name,
          room2: \`이동수업 \${String.fromCharCode(64 + subGroup)}\`,
        });
      } else {
        const subGroup = ((b - 1) % 6) + 1;
        rows.push({
          year: '2026',
          semester: '2',
          grade: '1',
          curriculum: '일반',
          subject: '정보(2)',
          room: \`컴퓨터실 \${subGroup}\`,
          track: '보통과/1학년/',
          ban: banStr,
          num,
          name,
          room2: \`컴퓨터실 \${subGroup}\`,
        });
      }

      // 음악: 1~8반 전원
      if (b <= 8) {
        const subGroup = ((b - 1) % 4) + 1;
        rows.push({
          year: '2026',
          semester: '2',
          grade: '1',
          curriculum: '일반',
          subject: '음악(1)',
          room: \`음악실 \${subGroup}\`,
          track: '보통과/1학년/',
          ban: banStr,
          num,
          name,
          room2: \`음악실 \${subGroup}\`,
        });
      }

      // 미술: 9~12반 전원 + 1~8반 중 번호 1~5
      if (b >= 9 || num <= 5) {
        const subGroup = ((b - 1) % 4) + 1;
        rows.push({
          year: '2026',
          semester: '2',
          grade: '1',
          curriculum: '일반',
          subject: '미술(1)',
          room: \`미술실 \${subGroup}\`,
          track: '보통과/1학년/',
          ban: banStr,
          num,
          name,
          room2: \`미술실 \${subGroup}\`,
        });
      }
    }
  }

  // 위탁학생 2명
  for (let num = 1; num <= 2; num++) {
    const name = \`위탁학생\${num}\`;
    rows.push({
      year: '2026',
      semester: '2',
      grade: '1',
      curriculum: '일반',
      subject: '공통국어2(4)',
      room: '7차일반 1',
      track: '보통과/1학년/',
      ban: '위탁1반',
      num,
      name,
      room2: '7차일반 1',
    });
    rows.push({
      year: '2026',
      semester: '2',
      grade: '1',
      curriculum: '일반',
      subject: '공통수학2(4)',
      room: '7차일반 1',
      track: '보통과/1학년/',
      ban: '위탁1반',
      num,
      name,
      room2: '7차일반 1',
    });
  }

  if (opts.includeInvalid) {
    rows.push({
      year: '2026',
      semester: '2',
      grade: '1',
      curriculum: '일반',
      subject: '공통국어2(4)',
      room: '7차일반 1',
      track: '보통과/1학년/',
      ban: '05반',
      num: 26,
      name: '(미재학) 학생999',
      room2: '7차일반 1',
    });
    rows.push({
      year: '2026',
      semester: '2',
      grade: '1',
      curriculum: '일반',
      subject: '공통국어2(4)',
      room: '7차일반 1',
      track: '보통과/1학년/',
      ban: '05반',
      num: 27,
      name: '',
      room2: '7차일반 1',
    });
  }

  return rows;
}

export function makeNeisWorkbook(rows: NeisRow[]): Uint8Array {
  const wsData: any[][] = [];
  // Dummy rows 1 to 4
  wsData.push(['부산광역시교육청 학생편성현황']);
  wsData.push(['조회일자: 2026-09-04']);
  wsData.push([]);
  wsData.push([]);
  // Row 5 header starting at Col C (col index 2)
  wsData.push([
    '',
    '',
    '학년도',
    '학기',
    '학년',
    '편제명',
    '개설과목(단위수)',
    '개설강의실',
    '계열/학년/학과',
    '반',
    '번호',
    '성명',
  ]);

  for (const r of rows) {
    wsData.push([
      '',
      '',
      r.year,
      r.semester,
      r.grade,
      r.curriculum,
      r.subject,
      r.room,
      r.track,
      r.ban,
      r.num,
      r.name,
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(wsData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '학생편성현황');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
}
`);

// 2. unit/neisImport.test.ts
write('test/unit/neisImport.test.ts', `
import { describe, it, expect } from 'vitest';
import { parseNeisFile } from '../../src/domain/neisImport';
import { makeNeisRows, makeNeisWorkbook } from '../fixtures/makeNeisFixture';

describe('neisImport', () => {
  it('parses valid NEIS workbook with padding and removes non-students', () => {
    const rawRows = makeNeisRows({ includeInvalid: true });
    const buffer = makeNeisWorkbook(rawRows);
    const res = parseNeisFile(buffer);

    expect(res.removedCount).toBe(2);
    expect(res.rows.length).toBe(rawRows.length - 2);
    expect(res.rows[0].ban).toBe('01반');
    expect(res.rows.some(r => r.name.includes('미재학'))).toBe(false);
  });

  it('keeps 1반 if ban count < 10', () => {
    const rawRows = makeNeisRows({ pad: false });
    const buffer = makeNeisWorkbook(rawRows);
    const res = parseNeisFile(buffer);
    expect(res.rows[0].ban).toBe('1반');
  });
});
`);

// 3. unit/baseData.test.ts
write('test/unit/baseData.test.ts', `
import { describe, it, expect } from 'vitest';
import { makeNeisRows } from '../fixtures/makeNeisFixture';
import { parseNeisFile } from '../../src/domain/neisImport';
import { makeNeisWorkbook } from '../fixtures/makeNeisFixture';
import { buildSubjectTables, buildRooms, moveToConvenience } from '../../src/domain/baseData';
import { vbaVal } from '../../src/domain/util/vbaVal';

describe('baseData', () => {
  it('correctly calculates vbaVal', () => {
    expect(vbaVal('01반')).toBe(1);
    expect(vbaVal('편의반')).toBe(0);
    expect(vbaVal(' 12반')).toBe(12);
    expect(vbaVal('3.5x')).toBe(3.5);
  });

  it('builds subject tables and rooms', () => {
    const rows = parseNeisFile(makeNeisWorkbook(makeNeisRows())).rows;
    const { subjectSummary, subjectBans } = buildSubjectTables(rows, 1);
    expect(subjectSummary.length).toBeGreaterThan(5);

    const rooms = buildRooms(rows, subjectSummary, subjectBans);
    expect(rooms.some(r => r.roomName === '별도실1')).toBe(true);
    expect(rooms.some(r => r.banName === '01반')).toBe(true);
    expect(rooms.some(r => r.banName === '위탁학생')).toBe(true);
  });

  it('handles convenience class move', () => {
    let rows = parseNeisFile(makeNeisWorkbook(makeNeisRows())).rows;
    rows = moveToConvenience(rows, '03반', 7);
    const { subjectSummary, subjectBans } = buildSubjectTables(rows, 2);
    expect(subjectBans.some(b => b.room === '편의반')).toBe(true);
  });
});
`);

// 4. unit/subjects.test.ts
write('test/unit/subjects.test.ts', `
import { describe, it, expect } from 'vitest';
import { parseNeisFile } from '../../src/domain/neisImport';
import { makeNeisRows, makeNeisWorkbook } from '../fixtures/makeNeisFixture';
import { buildSubjectTables } from '../../src/domain/baseData';
import { buildTakers, findCompatGroups, buildStudents } from '../../src/domain/subjects';

describe('subjects', () => {
  it('finds compat groups for non-intersecting subjects', () => {
    const rows = parseNeisFile(makeNeisWorkbook(makeNeisRows())).rows;
    const { subjectSummary } = buildSubjectTables(rows, 1);
    const evalSubjects = subjectSummary.filter(s =>
      ['공통국어2(4)', '공통수학2(4)', '한국사(3)', '정보(2)'].includes(s.subject)
    );
    const takers = buildTakers(rows, evalSubjects);
    const { groups } = findCompatGroups(evalSubjects, takers, 302);

    expect(groups.some(g => g.subjects.includes('한국사(3)') && g.subjects.includes('정보(2)'))).toBe(true);
    expect(groups.some(g => g.subjects.includes('공통국어2(4)') && g.subjects.includes('공통수학2(4)'))).toBe(false);
  });

  it('builds student list correctly', () => {
    const rows = parseNeisFile(makeNeisWorkbook(makeNeisRows())).rows;
    const { subjectSummary } = buildSubjectTables(rows, 1);
    const students = buildStudents(rows, subjectSummary);
    expect(students.length).toBe(302);
  });
});
`);

// 5. unit/timetable.test.ts
write('test/unit/timetable.test.ts', `
import { describe, it, expect } from 'vitest';
import { parseNeisFile } from '../../src/domain/neisImport';
import { makeNeisRows, makeNeisWorkbook } from '../fixtures/makeNeisFixture';
import { buildSubjectTables } from '../../src/domain/baseData';
import { buildTakers, buildStudents } from '../../src/domain/subjects';
import { canSameTime, slotStatus, dayLoad, duplicateSubjects } from '../../src/domain/timetable';
import { createInitialDays, createInitialTimes, createInitialTimetable } from '../../src/domain/constants';

describe('timetable', () => {
  it('detects conflicting subjects', () => {
    const rows = parseNeisFile(makeNeisWorkbook(makeNeisRows())).rows;
    const { subjectSummary } = buildSubjectTables(rows, 1);
    const takers = buildTakers(rows, subjectSummary);

    expect(canSameTime(['공통국어2(4)', '공통수학2(4)'], takers)).toBe(false);
    expect(canSameTime(['한국사(3)', '정보(2)'], takers)).toBe(true);
  });

  it('checks slot status', () => {
    const rows = parseNeisFile(makeNeisWorkbook(makeNeisRows())).rows;
    const { subjectSummary } = buildSubjectTables(rows, 1);
    const takers = buildTakers(rows, subjectSummary);
    const days = createInitialDays();
    days[0].date = '2026-10-12';
    const times = createInitialTimes();
    times[0].time = '09:00 ~ 9:50';

    const tt = createInitialTimetable();
    tt['1_1'] = { subjects: ['공통국어2(4)'] };

    expect(slotStatus(1, 1, tt, days, times, takers).kind).toBe('ok');
    expect(slotStatus(1, 2, tt, days, times, takers).kind).toBe('empty');
  });
});
`);

// 6. unit/placement.test.ts
write('test/unit/placement.test.ts', `
import { describe, it, expect } from 'vitest';
import { parseNeisFile } from '../../src/domain/neisImport';
import { makeNeisRows, makeNeisWorkbook } from '../fixtures/makeNeisFixture';
import { buildSubjectTables, buildRooms } from '../../src/domain/baseData';
import { buildStudents } from '../../src/domain/subjects';
import { createInitialTimetable } from '../../src/domain/constants';
import { buildPlacementInfo } from '../../src/domain/placementInfo';
import { subjectBanEntries, cellDerived, slotSummary } from '../../src/domain/placement';
import { autoPlaceSlot } from '../../src/domain/autoPlace';

describe('placement', () => {
  it('generates placement info and runs auto placement', () => {
    const rows = parseNeisFile(makeNeisWorkbook(makeNeisRows())).rows;
    const { subjectSummary, subjectBans } = buildSubjectTables(rows, 1);
    const rooms = buildRooms(rows, subjectSummary, subjectBans);
    const students = buildStudents(rows, subjectSummary);
    const entries = subjectBanEntries(subjectBans);

    const tt = createInitialTimetable();
    tt['1_1'] = { subjects: ['공통국어2(4)'] };

    const placementSlots = buildPlacementInfo(tt, students, subjectSummary);
    expect(placementSlots.length).toBe(1);

    const placed = autoPlaceSlot(1, rooms[0].id, {}, placementSlots, rooms, entries, students, false);
    const sum = slotSummary(1, placed, placementSlots, entries);
    expect(sum.errorKey).toBe('OK');
  });
});
`);

// 7. unit/attendance.test.ts
write('test/unit/attendance.test.ts', `
import { describe, it, expect } from 'vitest';
import { parseNeisFile } from '../../src/domain/neisImport';
import { makeNeisRows, makeNeisWorkbook } from '../fixtures/makeNeisFixture';
import { buildSubjectTables, buildRooms } from '../../src/domain/baseData';
import { buildStudents } from '../../src/domain/subjects';
import { createInitialTimetable } from '../../src/domain/constants';
import { buildPlacementInfo } from '../../src/domain/placementInfo';
import { subjectBanEntries } from '../../src/domain/placement';
import { autoPlaceSlot } from '../../src/domain/autoPlace';
import { buildAttendance, seatBySeq, seatRandom, hasErrorSeat } from '../../src/domain/attendance';

describe('attendance', () => {
  it('builds attendance records and assigns seats', () => {
    const rows = parseNeisFile(makeNeisWorkbook(makeNeisRows())).rows;
    const { subjectSummary, subjectBans } = buildSubjectTables(rows, 1);
    const rooms = buildRooms(rows, subjectSummary, subjectBans);
    const students = buildStudents(rows, subjectSummary);
    const entries = subjectBanEntries(subjectBans);

    const tt = createInitialTimetable();
    tt['1_1'] = { subjects: ['공통국어2(4)'] };
    const placementSlots = buildPlacementInfo(tt, students, subjectSummary);
    const placement = autoPlaceSlot(1, rooms[0].id, {}, placementSlots, rooms, entries, students, false);

    const { rows: attRows } = buildAttendance(rows, students, rooms, placementSlots, placement, entries);
    expect(attRows.length).toBe(302);

    const seated = seatBySeq(attRows);
    expect(seated[0].seat).toBe(1);

    const randomized = seatRandom(seated, () => 0.5);
    expect(randomized.length).toBe(302);
  });
});
`);

console.log('Part 5 (Tests) written.');
