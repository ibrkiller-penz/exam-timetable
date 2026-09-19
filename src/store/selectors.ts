import { AppState, SlotKey, ExamRoom, PlacementSlot, SlotSummary, StudentKey, SubjectBanKey, SubjectBanEntry, CellInfo } from '../domain/types';
import { subjectBanEntries, slotSummary as calcSlotSummary, cellInfo as calcCellInfo, waitByBan as calcWaitByBan, cellDerived } from '../domain/placement';
import { buildTakers } from '../domain/subjects';
import { buildPlacementInfo } from '../domain/placementInfo';
import { duplicateSubjects, remainSubjects, canSubjectsForSlot, dayLoad } from '../domain/timetable';

export const selGrade = (state: AppState): string => {
  if (state.neis.length > 1 && state.neis[1]?.grade) {
    return state.neis[1].grade.charAt(0);
  }
  return state.neis[0]?.grade?.charAt(0) ?? '1';
};

export const selTotalStudents = (state: AppState): number => {
  return state.rooms.reduce((acc, r) => acc + (r.stuCount ?? 0), 0);
};

export const selHasConvenience = (state: AppState): boolean => {
  return state.neis.some(r => r.room.includes('편의'));
};

export const selSubjectBanEntries = (state: AppState): Map<SubjectBanKey, SubjectBanEntry> => {
  return subjectBanEntries(state.subjectBans || []);
};

export const selTakersBySubject = (state: AppState): Map<string, Set<StudentKey>> => {
  return buildTakers(state.neis || [], state.evalSubjects || []);
};

export const selPlacementSlots = (state: AppState): PlacementSlot[] => {
  return buildPlacementInfo(state.timetable || {}, state.students || [], state.evalSubjects || []);
};

export const selDuplicateSubjects = (state: AppState): string[] => {
  return duplicateSubjects(state.timetable);
};

export const selRemainSubjects = (state: AppState): string[] => {
  return remainSubjects(state.evalSubjects, state.timetable);
};

export const selCanSubjects = (state: AppState, slot: SlotKey | null): string[] => {
  const takers = selTakersBySubject(state);
  return canSubjectsForSlot(slot, state.evalSubjects, state.timetable, takers);
};

export const selDayLoad = (state: AppState, day: 1 | 2 | 3 | 4 | 5) => {
  return dayLoad(day, state.timetable, state.students);
};

export const selSlotSummary = (state: AppState, slotIndex: number): SlotSummary => {
  const pSlots = selPlacementSlots(state);
  const entries = selSubjectBanEntries(state);
  return calcSlotSummary(slotIndex, state.placement, pSlots, entries, state.studentPlacements, state.students);
};

export const selCellInfo = (state: AppState, slotIndex: number, roomId: string): CellInfo | null => {
  const pSlots = selPlacementSlots(state);
  const entries = selSubjectBanEntries(state);
  return calcCellInfo(slotIndex, roomId, state.placement, pSlots, state.rooms, entries);
};

export const selExtraRooms = (state: AppState): ExamRoom[] => {
  return state.rooms.filter(r => (r.maxClassSize === null || r.maxClassSize === 0) && r.capacity > 0);
};
