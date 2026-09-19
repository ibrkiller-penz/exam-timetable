import React, { useState, useEffect } from 'react';
import { useAppStore } from './store/appStore';
import { AppShell } from './components/AppShell';

import { Step1Neis } from './pages/Step1Neis';
import { Step2BaseInfo } from './pages/Step2BaseInfo';
import { Step3Subjects } from './pages/Step3Subjects';
import { Step4EvalSubjects } from './pages/Step4EvalSubjects';
import { Step5StudentSubjects } from './pages/Step5StudentSubjects';
import { Step6Timetable } from './pages/Step6Timetable';
import { Step7Placement } from './pages/Step7Placement';
import { Step8Attendance } from './pages/Step8Attendance';

import { Report1GradeTable } from './pages/reports/Report1GradeTable';
import { Report2ExamRoom } from './pages/reports/Report2ExamRoom';
import { Report3RoomTimetable } from './pages/reports/Report3RoomTimetable';
import { Report4SeatMap } from './pages/reports/Report4SeatMap';
import { Report5ClassTable } from './pages/reports/Report5ClassTable';
import { Report6StudentTable } from './pages/reports/Report6StudentTable';
import { Report7Labels } from './pages/reports/Report7Labels';

export const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState('step1');
  const initStore = useAppStore(state => state.initStore);

  useEffect(() => {
    initStore();
  }, [initStore]);

  const renderContent = () => {
    switch (currentTab) {
      case 'step1': return <Step1Neis />;
      case 'step2': return <Step2BaseInfo />;
      case 'step3': return <Step3Subjects />;
      case 'step4': return <Step4EvalSubjects />;
      case 'step5': return <Step5StudentSubjects />;
      case 'step6': return <Step6Timetable />;
      case 'step7': return <Step7Placement />;
      case 'step8': return <Step8Attendance />;
      case 'r1': return <Report1GradeTable />;
      case 'r2': return <Report2ExamRoom />;
      case 'r3': return <Report3RoomTimetable />;
      case 'r4': return <Report4SeatMap />;
      case 'r5': return <Report5ClassTable />;
      case 'r6': return <Report6StudentTable />;
      case 'r7': return <Report7Labels />;
      default: return <Step1Neis />;
    }
  };

  return (
    <AppShell currentTab={currentTab} onTabChange={setCurrentTab}>
      {renderContent()}
    </AppShell>
  );
};
export default App;
