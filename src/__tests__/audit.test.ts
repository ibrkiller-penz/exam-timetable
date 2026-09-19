/**
 * Comprehensive placement system audit.
 * Run with: npx vitest run src/__tests__/audit.test.ts
 */
import { describe, it, expect } from 'vitest';
import { normalizeNeisRooms, buildSubjectTables, buildRooms } from '../domain/baseData';
import { buildStudents } from '../domain/subjects';
import { subjectBanEntries, slotSummary, cellInfo, panelItems, waitByBan, cellDerived } from '../domain/placement';
import { buildPlacementInfo } from '../domain/placementInfo';
import { autoPlaceSlot, autoPlaceAll, initSlotStudentPlacements, sanitizePlacementGrid } from '../domain/autoPlace';
import { isWaitCell, parseWaitCount } from '../domain/types';
import type { NeisRow, AppState, SubjectBanEntry, ExamRoom, Student } from '../domain/types';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// Try to load state from localStorage dump, Firestore dump, or generate fresh
function loadState(): AppState | null {
  const paths = [
    resolve(__dirname, '../../state_dump.json'),
    resolve(__dirname, '../../test_state.json'),
  ];
  for (const p of paths) {
    if (existsSync(p)) {
      return JSON.parse(readFileSync(p, 'utf-8'));
    }
  }
  return null;
}

// Generate test data from NEIS file if available
function generateTestData() {
  // Use vitest sample data — we just need to test the algorithms
  const neis: NeisRow[] = [];
  const subjects = ['한국사', '수학Ⅰ', '영어Ⅰ'];
  for (let ban = 1; ban <= 3; ban++) {
    for (let num = 1; num <= 10; num++) {
      for (const subject of subjects) {
        neis.push({
          year: '2026', semester: '1', grade: '3학년',
          curriculum: '2015', subject,
          room: `7차일반 ${ban}`, track: '',
          ban: `${ban}반`, num, name: `학생${ban}_${num}`,
          room2: `7차일반 ${ban}`,
        });
      }
    }
  }
  return neis;
}

describe('Placement System Comprehensive Audit', () => {
  // Use a simple synthetic dataset for the audit
  const neis = generateTestData();
  const normalizedNeis = normalizeNeisRooms(neis);
  const { subjectSummary, subjectBans } = buildSubjectTables(normalizedNeis, 1);
  
  const evalSubjects = subjectSummary; // all subjects for testing
  const students = buildStudents(normalizedNeis, evalSubjects);
  const entries = subjectBanEntries(subjectBans);
  const rooms = buildRooms(normalizedNeis, subjectSummary, subjectBans);
  
  // Build a simple timetable: 1 slot with 한국사
  const timetable: AppState['timetable'] = {
    '1_1': { subjects: ['한국사'] },
    '1_2': { subjects: ['수학Ⅰ'] },
    '2_1': { subjects: ['영어Ⅰ'] },
    '1_3': { subjects: [] }, '1_4': { subjects: [] }, '1_5': { subjects: [] },
    '2_2': { subjects: [] }, '2_3': { subjects: [] }, '2_4': { subjects: [] }, '2_5': { subjects: [] },
    '3_1': { subjects: [] }, '3_2': { subjects: [] }, '3_3': { subjects: [] }, '3_4': { subjects: [] }, '3_5': { subjects: [] },
    '4_1': { subjects: [] }, '4_2': { subjects: [] }, '4_3': { subjects: [] }, '4_4': { subjects: [] }, '4_5': { subjects: [] },
    '5_1': { subjects: [] }, '5_2': { subjects: [] }, '5_3': { subjects: [] }, '5_4': { subjects: [] }, '5_5': { subjects: [] },
  };
  const placementSlots = buildPlacementInfo(timetable, students, evalSubjects);

  it('should have correct total students', () => {
    expect(students.length).toBe(30); // 3 bans x 10 students
    console.log(`Total students: ${students.length}`);
  });

  it('should have correct entries', () => {
    console.log('\nEntries:');
    for (const [key, entry] of entries) {
      console.log(`  ${key}: room=${entry.room}, stuCount=${entry.stuCount}, index=${entry.index}`);
    }
    // Each subject has 3 bans with 10 students each
    expect(entries.size).toBe(9); // 3 subjects x 3 bans
    for (const [, entry] of entries) {
      expect(entry.stuCount).toBe(10);
    }
  });

  it('should have correct room ordering for VBA algorithm', () => {
    console.log('\nRoom ordering:');
    for (let i = 0; i < rooms.length; i++) {
      console.log(`  rooms[${i}]: id=${rooms[i].id}, banName="${rooms[i].banName}", roomName="${rooms[i].roomName}"`);
    }
    // Regular rooms should come first (banName not empty), sorted by banName
    // Extra rooms should come last
    const regularRooms = rooms.filter(r => r.banName);
    const extraRooms = rooms.filter(r => !r.banName);
    expect(regularRooms.length).toBe(3);
    expect(extraRooms.length).toBe(3);
    
    // Verify rooms[T-1] mapping works
    for (const [key, entry] of entries) {
      const m = /7차일반\s*(\d+)/.exec(entry.room);
      if (!m) continue;
      const T = Number(m[1]);
      const target = rooms[T - 1];
      expect(target).toBeDefined();
      expect(target.banName).toBeTruthy();
      console.log(`  ${key}: T=${T} → rooms[${T-1}] = ${target.roomName} (${target.banName})`);
    }
  });

  it('should auto-place each slot correctly', () => {
    for (const ps of placementSlots) {
      console.log(`\nSlot ${ps.index} (${ps.title}): subjects=[${ps.subjects.join(', ')}]`);
      console.log(`  takers=${ps.takers}, nonTakers=${ps.nonTakers}, banCountTotal=${ps.banCountTotal}`);
      
      const placed = autoPlaceSlot(
        ps.index,
        rooms[0]?.id ?? '',
        {},
        placementSlots,
        rooms,
        entries,
        students,
        false
      );
      
      const row = placed[ps.index] ?? {};
      const sum = slotSummary(ps.index, placed, placementSlots, entries);
      
      console.log(`  After auto-place:`);
      for (const r of rooms) {
        const val = row[r.id] ?? '';
        if (val) {
          const d = cellDerived(val, entries);
          console.log(`    ${r.roomName}: ${val} (${d.stuCount}명)`);
        }
      }
      console.log(`  Summary: error=${sum.errorKey}, remaining: ban=${sum.remaining.ban}, takers=${sum.remaining.takers}, nonTakers=${sum.remaining.nonTakers}`);
      
      expect(sum.errorKey).toBe('OK');
    }
  });

  it('should assign ALL students in initSlotStudentPlacements', () => {
    const placed = autoPlaceAll({}, placementSlots, rooms, entries, students);
    
    for (const ps of placementSlots) {
      const row = placed[ps.index] ?? {};
      const slotPlacements = initSlotStudentPlacements(ps.index, row, placementSlots, rooms, entries, students);
      const assignedCount = Object.keys(slotPlacements).length;
      
      console.log(`\nSlot ${ps.index}: assigned=${assignedCount}/${students.length}`);
      
      // Find missing students
      const missing = students.filter(st => !slotPlacements[`${st.ban}-${st.num}`]);
      if (missing.length > 0) {
        console.log(`  Missing students:`);
        for (const st of missing) {
          console.log(`    ${st.ban}-${st.num} (${st.name}), subjects=[${st.subjects.join(',')}]`);
        }
      }
      
      expect(assignedCount).toBe(students.length);
    }
  });

  it('should match offset-based assignment to NEIS room membership', () => {
    let mismatches = 0;
    for (const [key, entry] of entries) {
      // Get NEIS students for this subject+room
      const neisStudentsForBan = normalizedNeis
        .filter(r => r.subject === entry.subject && r.room === entry.room)
        .map(r => `${r.ban}-${r.num}`);
      const neisSet = new Set(neisStudentsForBan);
      
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
        console.log(`❌ ${key} MISMATCH:`);
        if (inNeisNotOffset.length > 0) console.log(`  In NEIS but NOT offset: ${inNeisNotOffset.join(', ')}`);
        if (inOffsetNotNeis.length > 0) console.log(`  In offset but NOT NEIS: ${inOffsetNotNeis.join(', ')}`);
        mismatches++;
      }
    }
    
    expect(mismatches).toBe(0);
  });

  it('should not double-count students in initSlotStudentPlacements', () => {
    const placed = autoPlaceAll({}, placementSlots, rooms, entries, students);
    
    for (const ps of placementSlots) {
      const row = placed[ps.index] ?? {};
      const slotPlacements = initSlotStudentPlacements(ps.index, row, placementSlots, rooms, entries, students);
      
      // Check no student in multiple rooms
      const roomAssignments = new Map<string, string>();
      for (const [stKey, roomId] of Object.entries(slotPlacements)) {
        if (roomAssignments.has(stKey)) {
          throw new Error(`Slot ${ps.index}: Student ${stKey} assigned to both ${roomAssignments.get(stKey)} and ${roomId}`);
        }
        roomAssignments.set(stKey, roomId);
      }
    }
  });

  it('should have cellDerived().stuCount match actual assigned students', () => {
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
          console.log(`❌ Slot ${ps.index} ${r.roomName}: cellDerived="${val}" shows ${derivedCount}명, actual=${actualCount}명`);
          mismatches++;
        }
      }
    }
    
    expect(mismatches).toBe(0);
  });

  it('should have waitByBan total match nonTakers', () => {
    for (const ps of placementSlots) {
      const w = waitByBan(ps.index, placementSlots, students);
      const totalWait = Array.from(w.values()).reduce((a, b) => a + b, 0);
      console.log(`Slot ${ps.index}: nonTakers=${ps.nonTakers}, waitByBan total=${totalWait}`);
      expect(totalWait).toBe(ps.nonTakers);
    }
  });
});
