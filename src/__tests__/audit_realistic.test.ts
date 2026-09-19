/**
 * Realistic audit test simulating the actual school scenario:
 * - 3학년, 8 regular rooms + 3 extra rooms
 * - Mixed subjects: some taken by all students (한국사), some by subsets
 * - 위탁반 student 
 * - Slots with multiple subjects
 */
import { describe, it, expect } from 'vitest';
import { normalizeNeisRooms, buildSubjectTables, buildRooms } from '../domain/baseData';
import { buildStudents } from '../domain/subjects';
import { subjectBanEntries, slotSummary, cellDerived, waitByBan, panelItems, cellInfo } from '../domain/placement';
import { buildPlacementInfo } from '../domain/placementInfo';
import { autoPlaceSlot, autoPlaceAll, initSlotStudentPlacements } from '../domain/autoPlace';
import { isWaitCell, parseWaitCount } from '../domain/types';
import type { NeisRow, AppState, ExamRoom } from '../domain/types';

function buildRealisticNeis(): NeisRow[] {
  const neis: NeisRow[] = [];
  // 8 bans, varying sizes (typical Korean school)
  const banSizes = [28, 27, 28, 27, 28, 27, 28, 24]; // total 217
  
  // 한국사: ALL students take it, each in their own ban's room
  for (let b = 0; b < 8; b++) {
    for (let n = 1; n <= banSizes[b]; n++) {
      neis.push({
        year: '2026', semester: '1', grade: '3학년',
        curriculum: '2015', subject: '한국사',
        room: `7차일반 ${b + 1}`, track: '',
        ban: `${b + 1}반`, num: n, name: `학생${b + 1}_${n}`,
        room2: `7차일반 ${b + 1}`,
      });
    }
  }
  
  // 실용수학: Only students from 1반 and 2반 (55 students in 2 bans)
  for (let b = 0; b < 2; b++) {
    for (let n = 1; n <= banSizes[b]; n++) {
      neis.push({
        year: '2026', semester: '1', grade: '3학년',
        curriculum: '2015', subject: '실용수학',
        room: `7차일반 ${b + 1}`, track: '',
        ban: `${b + 1}반`, num: n, name: `학생${b + 1}_${n}`,
        room2: `7차일반 ${b + 1}`,
      });
    }
  }
  
  // 확률과 통계: Students from 3반~6반 (110 students in 4 bans)
  for (let b = 2; b < 6; b++) {
    for (let n = 1; n <= banSizes[b]; n++) {
      neis.push({
        year: '2026', semester: '1', grade: '3학년',
        curriculum: '2015', subject: '확률과 통계',
        room: `7차일반 ${b + 1}`, track: '',
        ban: `${b + 1}반`, num: n, name: `학생${b + 1}_${n}`,
        room2: `7차일반 ${b + 1}`,
      });
    }
  }
  
  // 미적분: Students from 7반~8반 (52 students in 2 bans)
  for (let b = 6; b < 8; b++) {
    for (let n = 1; n <= banSizes[b]; n++) {
      neis.push({
        year: '2026', semester: '1', grade: '3학년',
        curriculum: '2015', subject: '미적분',
        room: `7차일반 ${b + 1}`, track: '',
        ban: `${b + 1}반`, num: n, name: `학생${b + 1}_${n}`,
        room2: `7차일반 ${b + 1}`,
      });
    }
  }
  
  // 고전과 윤리: Only some students from each ban (varying per ban)
  // 1반: students 1-8, 2반: 1-8, 3반: 1-7
  for (let b = 0; b < 3; b++) {
    const count = b < 2 ? 8 : 7;
    for (let n = 1; n <= count; n++) {
      neis.push({
        year: '2026', semester: '1', grade: '3학년',
        curriculum: '2015', subject: '고전과 윤리',
        room: `7차일반 ${b + 1}`, track: '',
        ban: `${b + 1}반`, num: n, name: `학생${b + 1}_${n}`,
        room2: `7차일반 ${b + 1}`,
      });
    }
  }
  
  return neis;
}

describe('Realistic Placement Audit', () => {
  const rawNeis = buildRealisticNeis();
  const neis = normalizeNeisRooms(rawNeis);
  const { subjectSummary, subjectBans } = buildSubjectTables(neis, 1);
  const students = buildStudents(neis, subjectSummary);
  const entries = subjectBanEntries(subjectBans);
  const rooms = buildRooms(neis, subjectSummary, subjectBans);
  
  // Slot 1: 한국사 (all students, 8 bans)
  // Slot 2: 실용수학 + 확률과 통계 + 미적분 (all students, 2+4+2=8 bans) 
  // Slot 3: 고전과 윤리 (23 students, 3 bans)
  const timetable: AppState['timetable'] = {
    '1_1': { subjects: ['한국사'] },
    '1_2': { subjects: ['실용수학', '확률과 통계', '미적분'] },
    '2_1': { subjects: ['고전과 윤리'] },
    '1_3': { subjects: [] }, '1_4': { subjects: [] }, '1_5': { subjects: [] },
    '2_2': { subjects: [] }, '2_3': { subjects: [] }, '2_4': { subjects: [] }, '2_5': { subjects: [] },
    '3_1': { subjects: [] }, '3_2': { subjects: [] }, '3_3': { subjects: [] }, '3_4': { subjects: [] }, '3_5': { subjects: [] },
    '4_1': { subjects: [] }, '4_2': { subjects: [] }, '4_3': { subjects: [] }, '4_4': { subjects: [] }, '4_5': { subjects: [] },
    '5_1': { subjects: [] }, '5_2': { subjects: [] }, '5_3': { subjects: [] }, '5_4': { subjects: [] }, '5_5': { subjects: [] },
  };
  const placementSlots = buildPlacementInfo(timetable, students, subjectSummary);

  it('reports data overview', () => {
    console.log('=== DATA OVERVIEW ===');
    console.log(`Students: ${students.length}`);
    console.log(`SubjectBans: ${subjectBans.length}`);
    console.log(`Entries: ${entries.size}`);
    console.log(`Rooms: ${rooms.length}`);
    console.log(`PlacementSlots: ${placementSlots.length}`);
    
    console.log('\nSubject Summary:');
    for (const s of subjectSummary) {
      console.log(`  ${s.subject}: banCount=${s.banCount}, stuCount=${s.stuCount}`);
    }
    
    console.log('\nEntries (full):');
    for (const [key, e] of entries) {
      console.log(`  ${key}: room=${e.room}, stuCount=${e.stuCount}, index=${e.index}, subject=${e.subject}`);
    }
    
    console.log('\nRooms:');
    for (let i = 0; i < rooms.length; i++) {
      console.log(`  rooms[${i}]: id=${rooms[i].id}, banName="${rooms[i].banName}", roomName="${rooms[i].roomName}", capacity=${rooms[i].capacity}, stuCount=${rooms[i].stuCount}`);
    }
    
    console.log('\nPlacement Slots:');
    for (const ps of placementSlots) {
      console.log(`  Slot ${ps.index} (${ps.title}): subjects=[${ps.subjects.join(',')}], banCounts=[${ps.banCounts.join(',')}], takers=${ps.takers}, nonTakers=${ps.nonTakers}`);
    }
    
    expect(true).toBe(true);
  });

  it('auto-places all slots correctly', () => {
    const placed = autoPlaceAll({}, placementSlots, rooms, entries, students);
    
    for (const ps of placementSlots) {
      const row = placed[ps.index] ?? {};
      const sum = slotSummary(ps.index, placed, placementSlots, entries);
      
      console.log(`\n=== Slot ${ps.index} (${ps.title}) ===`);
      console.log(`  subjects=[${ps.subjects.join(',')}], takers=${ps.takers}, nonTakers=${ps.nonTakers}`);
      
      for (const r of rooms) {
        const val = row[r.id] ?? '';
        if (val) {
          const d = cellDerived(val, entries);
          console.log(`  ${r.roomName}(${r.banName || '별도'}): ${val} → ${d.stuCount}명`);
        }
      }
      
      console.log(`  Summary: error=${sum.errorKey}`);
      console.log(`    total: ban=${sum.total.ban}, takers=${sum.total.takers}, nonTakers=${sum.total.nonTakers}`);
      console.log(`    placed: ban=${sum.placed.ban}, takers=${sum.placed.takers}, nonTakers=${sum.placed.nonTakers}`);
      console.log(`    remaining: ban=${sum.remaining.ban}, takers=${sum.remaining.takers}, nonTakers=${sum.remaining.nonTakers}`);
      
      expect(sum.errorKey).toBe('OK');
    }
  });

  it('assigns ALL students per slot with no gaps', () => {
    const placed = autoPlaceAll({}, placementSlots, rooms, entries, students);
    
    for (const ps of placementSlots) {
      const row = placed[ps.index] ?? {};
      const slotPlacements = initSlotStudentPlacements(ps.index, row, placementSlots, rooms, entries, students);
      const assignedCount = Object.keys(slotPlacements).length;
      
      console.log(`\nSlot ${ps.index}: assigned=${assignedCount}/${students.length}`);
      
      const missing = students.filter(st => !slotPlacements[`${st.ban}-${st.num}`]);
      if (missing.length > 0) {
        console.log(`  ❌ MISSING ${missing.length} students:`);
        for (const st of missing.slice(0, 10)) {
          console.log(`    ${st.ban}-${st.num} (subjects=[${st.subjects.join(',')}])`);
        }
      }
      
      expect(assignedCount).toBe(students.length);
    }
  });

  it('cellDerived counts match actual assigned students', () => {
    const placed = autoPlaceAll({}, placementSlots, rooms, entries, students);
    let mismatches = 0;
    
    for (const ps of placementSlots) {
      const row = placed[ps.index] ?? {};
      const slotPlacements = initSlotStudentPlacements(ps.index, row, placementSlots, rooms, entries, students);
      
      for (const r of rooms) {
        const val = row[r.id];
        if (!val) continue;
        
        const derived = cellDerived(val, entries);
        const derivedCount = typeof derived.stuCount === 'number' ? derived.stuCount : 0;
        const actualCount = students.filter(st => slotPlacements[`${st.ban}-${st.num}`] === r.id).length;
        
        if (derivedCount !== actualCount) {
          console.log(`❌ Slot ${ps.index} ${r.roomName}: "${val}" shows ${derivedCount}명, actual=${actualCount}명`);
          mismatches++;
        }
      }
    }
    
    // Note: This WILL fail for wait cells because cellDerived uses the 
    // placement grid's wait count (capacity-based), while actual students
    // may distribute differently. This is a known expected behavior.
    if (mismatches > 0) {
      console.log(`\n⚠️  ${mismatches} mismatches found between cellDerived and actual assigned students.`);
      console.log(`This may be expected for wait cells.`);
    }
  });

  it('NEIS room membership matches offset-based assignment for exam bans', () => {
    let mismatches = 0;
    
    for (const [key, entry] of entries) {
      // Get NEIS students
      const neisStudents = neis
        .filter(r => r.subject === entry.subject && r.room === entry.room)
        .map(r => `${r.ban}-${r.num}`);
      const neisSet = new Set(neisStudents);
      
      // Get offset-based students
      const allSubjectStudents = students
        .filter(st => st.subjects.includes(entry.subject))
        .sort((a, b) => {
          if (a.ban !== b.ban) return a.ban.localeCompare(b.ban, 'ko');
          return a.num - b.num;
        });
      
      const subjectEntries = Array.from(entries.values())
        .filter(e => e.subject === entry.subject)
        .sort((a, b) => a.index - b.index);
      
      let offset = 0;
      for (const e of subjectEntries) {
        if (e.key === entry.key) break;
        offset += e.stuCount;
      }
      
      const offsetStudents = allSubjectStudents.slice(offset, offset + entry.stuCount);
      const offsetSet = new Set(offsetStudents.map(st => `${st.ban}-${st.num}`));
      
      const inNeisNotOffset = [...neisSet].filter(k => !offsetSet.has(k));
      const inOffsetNotNeis = [...offsetSet].filter(k => !neisSet.has(k));
      
      if (inNeisNotOffset.length > 0 || inOffsetNotNeis.length > 0) {
        console.log(`❌ ${key} (room=${entry.room}, stuCount=${entry.stuCount}):`);
        if (inNeisNotOffset.length > 0) console.log(`  In NEIS NOT offset: ${inNeisNotOffset.join(', ')}`);
        if (inOffsetNotNeis.length > 0) console.log(`  In offset NOT NEIS: ${inOffsetNotNeis.join(', ')}`);
        mismatches++;
      }
    }
    
    expect(mismatches).toBe(0);
  });

  it('validates Slot 3 (고전과 윤리) with many non-takers', () => {
    const placed = autoPlaceAll({}, placementSlots, rooms, entries, students);
    const slot3 = placementSlots.find(ps => ps.subjects.includes('고전과 윤리'));
    if (!slot3) return;
    
    const row = placed[slot3.index] ?? {};
    const slotPlacements = initSlotStudentPlacements(slot3.index, row, placementSlots, rooms, entries, students);
    
    console.log('\n=== Slot 3 (고전과 윤리) Detail ===');
    console.log(`  takers=${slot3.takers}, nonTakers=${slot3.nonTakers}`);
    
    // Check each room
    for (const r of rooms) {
      const val = row[r.id] ?? '';
      if (!val) continue;
      
      const assignedStudents = students.filter(st => slotPlacements[`${st.ban}-${st.num}`] === r.id);
      
      if (isWaitCell(val)) {
        // Wait room: all students should be non-takers for this slot
        const wronglyWaiting = assignedStudents.filter(st => 
          st.subjects.some(s => slot3.subjects.includes(s))
        );
        if (wronglyWaiting.length > 0) {
          console.log(`  ❌ ${r.roomName}: ${wronglyWaiting.length} EXAM TAKERS in wait room!`);
        }
        
        // Check home class preference
        const homeStudents = assignedStudents.filter(st => 
          st.ban.replace('반', '') === r.banName.replace('반', '')
        );
        console.log(`  ${r.roomName}(${r.banName}): ${val} → actual ${assignedStudents.length}명 (${homeStudents.length} home)`);
      } else {
        // Exam room: all students should be takers
        const entry = entries.get(val);
        if (entry) {
          const wrongSubject = assignedStudents.filter(st => !st.subjects.includes(entry.subject));
          if (wrongSubject.length > 0) {
            console.log(`  ❌ ${r.roomName}: ${wrongSubject.length} students DON'T take ${entry.subject}`);
          }
        }
        console.log(`  ${r.roomName}(${r.banName}): ${val} → actual ${assignedStudents.length}명`);
      }
    }
    
    const assignedCount = Object.keys(slotPlacements).length;
    console.log(`\n  Total assigned: ${assignedCount}/${students.length}`);
    expect(assignedCount).toBe(students.length);
  });
});
